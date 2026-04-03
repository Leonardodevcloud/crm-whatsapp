export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';
const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';

// Parser CSV robusto (mesmo do profissionais que já funciona)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else if (ch !== '\r') { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  const headers = parseCSVLine(linhas[0]).map(h =>
    h.replace(/^\uFEFF/, '').replace(/"/g, '').trim()
  );
  const dados: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) continue;
    const valores = parseCSVLine(linhas[i]);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => { obj[header] = (valores[index] || '').replace(/"/g, '').trim(); });
    dados.push(obj);
  }
  return dados;
}

function normalizarTelefone(telefone: string): string {
  if (!telefone) return '';
  let numeros = telefone.replace(/\D/g, '');
  if (numeros.length >= 12 && numeros.startsWith('55')) numeros = numeros.substring(2);
  if (numeros.length === 10) numeros = numeros.substring(0, 2) + '9' + numeros.substring(2);
  return numeros;
}

function parseDataBR(dataStr: string): string | null {
  if (!dataStr) return null;
  const m = dataStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    // ═══ 1. PLANILHA (mesmo código do /api/profissionais que funciona) ═══
    console.log('[Enriquecer] Buscando planilha...');
    const csvResp = await fetch(PLANILHA_CSV_URL, { headers: { 'Accept': 'text/csv' } });
    if (!csvResp.ok) throw new Error(`Planilha HTTP ${csvResp.status}`);
    const csvText = await csvResp.text();
    const dadosPlanilha = parseCSV(csvText);
    console.log(`[Enriquecer] Planilha: ${dadosPlanilha.length} registros`);

    // Criar mapa cod → { quem_ativou, data_ativacao }
    // E mapa telefone → { quem_ativou, data_ativacao }
    const mapaPorCod: Record<string, { quem_ativou: string; data_ativacao: string | null }> = {};
    const mapaPorTel: Record<string, { quem_ativou: string; data_ativacao: string | null }> = {};

    let comQuemAtivou = 0;
    for (const row of dadosPlanilha) {
      const codigo = row['Código'] || row['Codigo'] || row['codigo'] || '';
      const telefone = row['Telefone'] || row['telefone'] || '';
      const dataAtivacao = row['Data Ativação'] || row['Data Ativacao'] || row['data ativação'] || row['data ativacao'] || '';
      const quemAtivou = row['Quem Ativou'] || row['quem ativou'] || row['Quem ativou'] || '';

      const dados = {
        quem_ativou: quemAtivou.toUpperCase().trim(),
        data_ativacao: parseDataBR(dataAtivacao),
      };

      if (quemAtivou) comQuemAtivou++;

      if (codigo) mapaPorCod[codigo.trim()] = dados;
      if (telefone) {
        const norm = normalizarTelefone(telefone);
        if (norm) mapaPorTel[norm] = dados;
      }
    }

    console.log(`[Enriquecer] Planilha processada: ${Object.keys(mapaPorCod).length} por cod | ${comQuemAtivou} com "Quem Ativou"`);

    // ═══ 2. OBSERVAÇÕES DO SUPABASE ═══
    const client = supabaseAdmin || supabase;
    const { data: obsRows } = await client
      .from('profissionais_observacoes')
      .select('codigo, observacao');

    const observacoes: Record<string, string> = {};
    for (const row of obsRows || []) {
      if (row.codigo && row.observacao) observacoes[row.codigo] = row.observacao;
    }
    console.log(`[Enriquecer] Observações Supabase: ${Object.keys(observacoes).length}`);

    // ═══ 3. ENVIAR TUDO PRO BACKEND ═══
    const response = await fetch(`${BI_API_URL}/api/crm/leads-captura/enriquecer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({
        mapaPorCod,
        mapaPorTel,
        observacoes,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('[Enriquecer] Erro:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
