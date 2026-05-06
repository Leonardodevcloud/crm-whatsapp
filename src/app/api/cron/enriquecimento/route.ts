// ===========================================
// API: /api/cron/enriquecimento
// POST: Enriquecimento automático (chamado pelo N8N a cada 10min)
//
// 3 etapas:
// 1. Enriquecer via banco de profissionais (CRM → planilha fallback)
//    + planilha TP (tráfego pago) para tags
// 2. Verificar status na API Tutts (ativo/inativo → muda stage)
// 3. Automação de follow-ups (cria, mata, ressuscita)
//
// Auth: CRON_SECRET no header (N8N) ou JWT normal
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';
import {
  fetchProfissionaisCadastro,
  normalizarTelefone,
  gerarVariacoesTelefone,
} from '@/lib/profissionais-cadastro';

const CRON_SECRET = process.env.CRON_SECRET || 'tutts-cron-2026';
// Planilha TP (tráfego pago) — sheet DIFERENTE do banco de profissionais
const PLANILHA_TP_URL = 'https://docs.google.com/spreadsheets/d/1MOttPq20kzgnTY5Rv_9ocJNsp3ZFad0_xt_M96utES8/export?format=csv&gid=0';

// Limites para não sobrecarregar
const LIMITE_TUTTS_POR_EXECUCAO = 50;   // Máx leads pra verificar na API Tutts por run
const DELAY_ENTRE_CHAMADAS_MS = 150;     // Delay entre chamadas à API Tutts
const ENRICHMENT_COOLDOWN_MIN = 30;      // Só re-enriquece se last_enriched_at > 30min

// ============================================
// PRAZOS DE FOLLOW-UP
// ============================================
const PRAZOS = {
  NOVO_SEM_MUDANCA: 3,
  QUALIFICADO_SEM_FINALIZAR: 3,
  APOS_FOLLOWUP_CONCLUIDO: 5,
  FOLLOWUP_NAO_ATENDIDO: 2,
};

const MOTIVOS = {
  NOVO: 'Formalizar cadastro no aplicativo',
  QUALIFICADO: 'Formalizar ativação',
};

// ============================================
// UTILS
// ============================================
// normalizarTelefone / gerarVariacoesTelefone → importados de @/lib/profissionais-cadastro

// Parser CSV robusto — lida com vírgulas dentro de campos entre aspas
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  const headers = parseCSVLine(linhas[0]).map(h =>
    h.replace(/^\uFEFF/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  );
  const dados: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    const valores = parseCSVLine(linha);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => { obj[header] = valores[index] || ''; });
    dados.push(obj);
  }
  return dados;
}

function parseDataBR(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const partes = dateStr.split(/[\/\-]/);
  if (partes.length === 3) {
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    let ano = partes[2];
    if (ano.length === 2) ano = '20' + ano;
    const dataISO = `${ano}-${mes}-${dia}`;
    const dataObj = new Date(dataISO);
    if (!isNaN(dataObj.getTime())) return dataISO;
  }
  return null;
}

// ============================================
// MAIN
// ============================================
export async function POST(req: NextRequest) {
  // Au
