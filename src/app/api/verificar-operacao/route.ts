// ===========================================
// API: /api/verificar-operacao
// Verifica se leads finalizados estão em operação no BI
// Cruza CRM (Supabase) + Banco de Profissionais (Central Tutts) (deduplicado)
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { fetchProfissionaisCadastro } from '@/lib/profissionais-cadastro';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

function parseDateBR(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  // Primeiro tenta ISO (YYYY-MM-DD), que é o formato devolvido pelo backend
  const iso = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback formato BR
  const partes = iso.split('/');
  if (partes.length === 3) {
    return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);
    const dias = parseInt(searchParams.get('dias') || '30');
    const regiao = searchParams.get('regiao') || '';
    const dataInicio = searchParams.get('dataInicio') || '';
    const dataFim = searchParams.get('dataFim') || '';

    const dataLimiteInicio = dataInicio ? new Date(dataInicio + 'T00:00:00') : null;
    const dataLimiteFim = dataFim ? new Date(dataFim + 'T23:59:59') : null;

    // ============================================
    // 1. CRM: leads finalizados com cod_profissional
    // ============================================
    let query = client
      .from('dados_cliente')
      .select('id, nomewpp, telefone, cod_profissional, stage, regiao, updated_at')
      .eq('stage', 'finalizado')
      .not('cod_profissional', 'is', null)
      .order('updated_at', { ascending: false });

    if (regiao) query = query.eq('regiao', regiao);
    if (dataInicio) query = query.gte('updated_at', dataInicio + 'T00:00:00');
    if (dataFim) query = query.lte('updated_at', dataFim + 'T23:59:59');

    const { data: leadsCRM, error: errorLeads } = await query;
    if (errorLeads) throw errorLeads;

    // ============================================
    // 2. BANCO DE PROFISSIONAIS: CRM → planilha fallback (via backend)
    // ============================================
    let profissionaisPlanilha: Array<{ codigo: string; nome: string; regiao: string; telefone: string }> = [];
    try {
      const resp = await fetchProfissionaisCadastro();
      for (const p of resp.data) {
        if (!p.codigo) continue;

        // Filtrar por data (dataAtivacao já vem em ISO YYYY-MM-DD do backend)
        if (dataLimiteInicio && dataLimiteFim) {
          const dt = parseDateBR(p.dataAtivacao);
          if (!dt || dt < dataLimiteInicio || dt > dataLimiteFim) continue;
        }

        // Filtrar por região
        if (regiao && p.regiao !== regiao.toUpperCase()) continue;

        profissionaisPlanilha.push({
          codigo:   p.codigo,
          nome:     p.nome || '',
          regiao:   p.regiao || '',
          telefone: p.telefone || '',
        });
      }
    } catch (err) {
      console.error('[Operação] Erro ao buscar banco de profissionais:', err);
    }

    // ============================================
    // 3. MERGE: deduplicado por código
    // ============================================
    const codigosVistos = new Set<string>();
    const leadsMerged: Array<{
      cod_profissional: string;
      nomewpp: string;
      telefone: string;
      regiao: string;
      fonte: string;
    }> = [];

    // Planilha primeiro (mais assertiva)
    profissionaisPlanilha.forEach(p => {
      const codLimpo = p.codigo.replace(/\D/g, '');
      if (codLimpo && !codigosVistos.has(codLimpo)) {
        codigosVistos.add(codLimpo);
        leadsMerged.push({
          cod_profissional: codLimpo,
          nomewpp: p.nome,
          telefone: p.telefone,
          regiao: p.regiao,
          fonte: 'planilha',
        });
      }
    });

    // CRM depois (só se código não veio da planilha)
    (leadsCRM || []).forEach(lead => {
      const codLimpo = String(lead.cod_profissional).replace(/\D/g, '');
      if (codLimpo && !codigosVistos.has(codLimpo)) {
        codigosVistos.add(codLimpo);
        leadsMerged.push({
          cod_profissional: codLimpo,
          nomewpp: lead.nomewpp || '',
          telefone: lead.telefone || '',
          regiao: (lead.regiao || '').toUpperCase(),
          fonte: 'crm',
        });
      }
    });

    if (leadsMerged.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum lead ativado no período',
        total: 0,
        em_operacao: 0,
        nao_operando: 0,
        taxa_conversao: '0%',
        leads: [],
        bi_conectado: false,
        filtros: { dias, regiao, dataInicio, dataFim }
      });
    }

    // ============================================
    // 4. Chamar BI para verificar operação
    // ============================================
    const codigos = leadsMerged.map(l => l.cod_profissional);

    let biResult = null;
    try {
      console.log(`[CRM→BI] URL: ${BI_API_URL}/api/crm/verificar-operacao | service-key: ${CRM_SERVICE_KEY ? CRM_SERVICE_KEY.substring(0, 10) + '...' : 'NÃO CONFIGURADA'} | codigos: ${codigos.length}`);
      const biResponse = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
        },
        body: JSON.stringify({ codigos, dias }),
      });

      console.log(`[CRM→BI] Response status: ${biResponse.status}`);
      if (biResponse.ok) {
        biResult = await biResponse.json();
      } else {
        const errText = await biResponse.text();
        console.error('Erro na API do BI:', biResponse.status, errText.substring(0, 200));
      }
    } catch (biError) {
      console.error('Erro ao conectar no BI:', biError);
    }

    // 5. Mapear resultados do BI
    const statusMap = new Map<string, any>();
    if (biResult?.resultado) {
      biResult.resultado.forEach((r: any) => {
        statusMap.set(String(r.cod_profissional), r);
      });
    }

    // 6. Combinar
    const leadsComStatus = leadsMerged.map(lead => {
      const statusBI = statusMap.get(lead.cod_profissional);
      return {
        ...lead,
        em_operacao: statusBI?.em_operacao || false,
        bi_dados: statusBI?.dados || null,
      };
    });

    const emOperacao = leadsComStatus.filter(l => l.em_operacao).length;
    const naoOperando = leadsComStatus.filter(l => !l.em_operacao).length;

    return NextResponse.json({
      success: true,
      periodo_dias: dias,
      total: leadsMerged.length,
      em_operacao: emOperacao,
      nao_operando: naoOperando,
      taxa_conversao: ((emOperacao / leadsMerged.length) * 100).toFixed(1) + '%',
      leads: leadsComStatus,
      bi_conectado: biResult !== null,
      filtros: { dias, regiao, dataInicio, dataFim }
    });

  } catch (error: any) {
    console.error('Erro ao verificar operação:', error);
    return NextResponse.json(
      { error: 'Erro ao verificar operação', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// POST: Verificar códigos específicos
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const { codigos, dias = 30 } = await req.json();

    if (!codigos || !Array.isArray(codigos) || codigos.length === 0) {
      return NextResponse.json(
        { error: 'Lista de códigos é obrigatória', success: false },
        { status: 400 }
      );
    }

    const biResponse = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ codigos, dias }),
    });

    if (!biResponse.ok) {
      throw new Error(`Erro na API do BI: ${biResponse.status}`);
    }

    const biResult = await biResponse.json();

    return NextResponse.json({
      success: true,
      ...biResult
    });

  } catch (error: any) {
    console.error('Erro ao verificar operação:', error);
    return NextResponse.json(
      { error: 'Erro ao verificar operação', success: false, details: error.message },
      { status: 500 }
    );
  }
}
