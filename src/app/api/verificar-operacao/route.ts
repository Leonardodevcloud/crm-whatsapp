// ===========================================
// API: /api/verificar-operacao
// Verifica se leads finalizados estão em operação no BI
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// URL do servidor BI (configurar no .env)
const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';

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

    // 1. Buscar leads finalizados com cod_profissional
    let query = client
      .from('dados_cliente')
      .select('id, nomewpp, telefone, cod_profissional, stage, regiao, updated_at')
      .eq('stage', 'finalizado')
      .not('cod_profissional', 'is', null)
      .order('updated_at', { ascending: false });

    // Aplicar filtro de região se informado
    if (regiao) {
      query = query.eq('regiao', regiao);
    }

    const { data: leadsFinalizados, error: errorLeads } = await query;

    if (errorLeads) throw errorLeads;

    if (!leadsFinalizados || leadsFinalizados.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum lead finalizado com código profissional',
        total: 0,
        em_operacao: 0,
        nao_operando: 0,
        taxa_conversao: '0%',
        leads: [],
        filtros: { dias, regiao }
      });
    }

    // 2. Extrair códigos únicos
    const codigos = leadsFinalizados
      .map(l => l.cod_profissional)
      .filter(Boolean);

    // 3. Chamar API do BI para verificar operação
    let biResult = null;
    try {
      const biResponse = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigos, dias }),
      });

      if (biResponse.ok) {
        biResult = await biResponse.json();
      } else {
        console.error('Erro na API do BI:', biResponse.status);
      }
    } catch (biError) {
      console.error('Erro ao conectar no BI:', biError);
    }

    // 4. Mapear resultados
    const statusMap = new Map<string, any>();
    if (biResult?.resultado) {
      biResult.resultado.forEach((r: any) => {
        statusMap.set(String(r.cod_profissional), r);
      });
    }

    // 5. Combinar dados
    const leadsComStatus = leadsFinalizados.map(lead => {
      const codLimpo = String(lead.cod_profissional).replace(/\D/g, '');
      const statusBI = statusMap.get(codLimpo);
      
      return {
        ...lead,
        em_operacao: statusBI?.em_operacao || false,
        bi_dados: statusBI?.dados || null,
      };
    });

    // 6. Estatísticas
    const emOperacao = leadsComStatus.filter(l => l.em_operacao).length;
    const naoOperando = leadsComStatus.filter(l => !l.em_operacao).length;

    return NextResponse.json({
      success: true,
      periodo_dias: dias,
      total: leadsFinalizados.length,
      em_operacao: emOperacao,
      nao_operando: naoOperando,
      taxa_conversao: ((emOperacao / leadsFinalizados.length) * 100).toFixed(1) + '%',
      leads: leadsComStatus,
      bi_conectado: biResult !== null,
      filtros: { dias, regiao }
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

    // Chamar API do BI
    const biResponse = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
