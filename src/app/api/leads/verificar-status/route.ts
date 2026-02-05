// ===========================================
// API: /api/leads/verificar-status
// POST: Verifica status de múltiplos leads na API Tutts
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getLeadById, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';

export async function POST(req: NextRequest) {
  // Verificar autenticação
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json(
      { error: 'Não autenticado', success: false },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { leadIds } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'leadIds é obrigatório e deve ser um array', success: false },
        { status: 400 }
      );
    }

    // Limitar a 20 leads por requisição para não sobrecarregar
    const leadsParaVerificar = leadIds.slice(0, 20);
    
    console.log(`[Verificar Status] Verificando ${leadsParaVerificar.length} leads...`);

    const resultados: Array<{
      leadId: number;
      telefone: string | null;
      statusTutts: 'ativo' | 'inativo' | 'nao_encontrado' | 'erro';
      stageAnterior: string;
      stageNovo: string | null;
      atualizado: boolean;
    }> = [];

    // Processar cada lead
    for (const leadId of leadsParaVerificar) {
      const leadIdNum = parseInt(leadId);
      
      if (isNaN(leadIdNum)) {
        resultados.push({
          leadId,
          telefone: null,
          statusTutts: 'erro',
          stageAnterior: '',
          stageNovo: null,
          atualizado: false,
        });
        continue;
      }

      // Buscar lead
      const lead = await getLeadById(leadIdNum);
      
      if (!lead) {
        resultados.push({
          leadId: leadIdNum,
          telefone: null,
          statusTutts: 'erro',
          stageAnterior: '',
          stageNovo: null,
          atualizado: false,
        });
        continue;
      }

      // Pular se já está finalizado ou não tem telefone
      if (lead.stage === 'finalizado' || !lead.telefone) {
        resultados.push({
          leadId: leadIdNum,
          telefone: lead.telefone,
          statusTutts: lead.stage === 'finalizado' ? 'ativo' : 'nao_encontrado',
          stageAnterior: lead.stage,
          stageNovo: null,
          atualizado: false,
        });
        continue;
      }

      // Verificar status na API Tutts
      try {
        const statusTutts = await verificarStatusProfissional(lead.telefone);
        
        let statusStr: 'ativo' | 'inativo' | 'nao_encontrado' | 'erro' = 'nao_encontrado';
        if (statusTutts.found) {
          statusStr = statusTutts.ativo ? 'ativo' : 'inativo';
        }

        // Determinar novo stage
        const novoStage = determinarNovoStage(statusTutts, lead.stage);
        let atualizado = false;

        if (novoStage && novoStage !== lead.stage) {
          console.log(`[Verificar Status] Lead ${leadIdNum}: ${lead.stage} -> ${novoStage}`);
          await updateLead(leadIdNum, { stage: novoStage });
          atualizado = true;
        }

        resultados.push({
          leadId: leadIdNum,
          telefone: lead.telefone,
          statusTutts: statusStr,
          stageAnterior: lead.stage,
          stageNovo: novoStage,
          atualizado,
        });

      } catch (tuttsError: any) {
        console.error(`[Verificar Status] Erro no lead ${leadIdNum}:`, tuttsError);
        resultados.push({
          leadId: leadIdNum,
          telefone: lead.telefone,
          statusTutts: 'erro',
          stageAnterior: lead.stage,
          stageNovo: null,
          atualizado: false,
        });
      }

      // Pequeno delay para não sobrecarregar a API Tutts
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Contar resultados
    const atualizados = resultados.filter(r => r.atualizado).length;
    const encontrados = resultados.filter(r => r.statusTutts === 'ativo' || r.statusTutts === 'inativo').length;

    console.log(`[Verificar Status] Finalizado: ${atualizados} atualizados, ${encontrados} encontrados na API Tutts`);

    return NextResponse.json({
      success: true,
      data: {
        total: resultados.length,
        atualizados,
        encontrados,
        resultados,
      },
    });

  } catch (error: any) {
    console.error('Erro na API verificar-status:', error);
    return NextResponse.json(
      { error: 'Erro ao verificar status', success: false, details: error.message },
      { status: 500 }
    );
  }
}
