// ===========================================
// API: /api/leads-captura/enriquecer
// Monta mapas (por código e por telefone) com dados de ativação
// vindos do banco de profissionais (CRM → planilha fallback via backend)
// e envia para o backend Central Tutts atualizar os leads capturados.
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import {
  fetchProfissionaisCadastro,
  normalizarTelefone,
} from '@/lib/profissionais-cadastro';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    // ═══ 1. BANCO DE PROFISSIONAIS (CRM → planilha fallback via backend) ═══
    console.log('[Enriquecer] Buscando banco de profissionais...');
    const cadastro = await fetchProfissionaisCadastro();
    const dadosPlanilha = cadastro.data;
    console.log(
      `[Enriquecer] Banco: ${dadosPlanilha.length} registros ` +
      `(CRM=${cadastro.estatisticas?.por_origem?.crm ?? '?'} ` +
      `planilha=${cadastro.estatisticas?.por_origem?.planilha ?? '?'})`
    );

    // ═══ 2. MAPAS por código e por telefone ═══
    const mapaPorCod: Record<string, { quem_ativou: string; data_ativacao: string | null }> = {};
    const mapaPorTel: Record<string, { quem_ativou: string; data_ativacao: string | null }> = {};

    let comQuemAtivou = 0;
    for (const p of dadosPlanilha) {
      // Data já vem em ISO (YYYY-MM-DD) do backend, ou string vazia
      const dataISO = p.dataAtivacao && /^\d{4}-\d{2}-\d{2}$/.test(p.dataAtivacao)
        ? p.dataAtivacao
        : null;

      const dados = {
        quem_ativou: (p.quemAtivou || '').toUpperCase().trim(),
        data_ativacao: dataISO,
      };

      if (dados.quem_ativou) comQuemAtivou++;

      if (p.codigo) mapaPorCod[String(p.codigo).trim()] = dados;
      if (p.telefone) {
        const norm = normalizarTelefone(p.telefone);
        if (norm) mapaPorTel[norm] = dados;
      }
    }

    console.log(
      `[Enriquecer] Mapas: ${Object.keys(mapaPorCod).length} por cod | ` +
      `${Object.keys(mapaPorTel).length} por tel | ${comQuemAtivou} com "Quem Ativou"`
    );

    // ═══ 3. OBSERVAÇÕES DO SUPABASE ═══
    const client = supabaseAdmin || supabase;
    const { data: obsRows } = await client
      .from('profissionais_observacoes')
      .select('codigo, observacao');

    const observacoes: Record<string, string> = {};
    for (const row of obsRows || []) {
      if (row.codigo && row.observacao) observacoes[row.codigo] = row.observacao;
    }
    console.log(`[Enriquecer] Observações Supabase: ${Object.keys(observacoes).length}`);

    // ═══ 4. ENVIAR TUDO PRO BACKEND ═══
    const response = await fetch(`${BI_API_URL}/api/crm/leads-captura/enriquecer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ mapaPorCod, mapaPorTel, observacoes }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error('[Enriquecer] Erro:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
