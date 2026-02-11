// ===========================================
// API: /api/cron/enriquecimento
// POST: Enriquecimento automático (chamado pelo N8N a cada 10min)
// 
// 3 etapas:
// 1. Enriquecer pela planilha (região, nome, código, tags TP)
// 2. Verificar status na API Tutts (ativo/inativo → muda stage)
// 3. Automação de follow-ups (cria, mata, ressuscita)
//
// Auth: CRON_SECRET no header (N8N) ou JWT normal
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';

const CRON_SECRET = process.env.CRON_SECRET || 'tutts-cron-2026';
const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';
const PLANILHA_TP_URL = 'https://docs.google.com/spreadsheets/d/1fC1i_qTiUmX77-Y5iRjGIJRzMSifPUSeULe_Thh1rZU/export?format=csv&gid=0';

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
function normalizarTelefone(telefone: string): string {
  if (!telefone) return '';
  let numeros = telefone.replace(/\D/g, '');
  if (numeros.length >= 12 && numeros.startsWith('55')) {
    numeros = numeros.substring(2);
  }
  if (numeros.length === 10) {
    numeros = numeros.substring(0, 2) + '9' + numeros.substring(2);
  }
  return numeros;
}

function gerarVariacoesTelefone(telefone: string): string[] {
  const normalizado = normalizarTelefone(telefone);
  if (!normalizado) return [];
  const variacoes: string[] = [normalizado];
  variacoes.push('55' + normalizado);
  if (normalizado.length === 11) {
    const sem9 = normalizado.substring(0, 2) + normalizado.substring(3);
    variacoes.push(sem9);
    variacoes.push('55' + sem9);
  }
  return variacoes;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  const headers = linhas[0].split(',').map(h =>
    h.trim().replace(/"/g, '').replace(/^\uFEFF/, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  );
  const dados: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    const valores = linha.split(',').map(v => v.trim().replace(/"/g, ''));
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
  // Auth: CRON_SECRET ou JWT
  const cronSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization');

  let autenticado = false;

  if (cronSecret === CRON_SECRET) {
    autenticado = true;
  } else {
    const user = getUserFromHeader(authHeader);
    if (user) autenticado = true;
  }

  if (!autenticado) {
    return NextResponse.json({ error: 'Não autorizado', success: false }, { status: 401 });
  }

  const inicio = Date.now();
  const client = supabaseAdmin || supabase;

  // Parâmetros opcionais
  let body: any = {};
  try { body = await req.json(); } catch { /* sem body = cron normal */ }

  // Se veio lead_id específico, enriquece só ele (chamada por evento)
  const leadIdEspecifico = body?.lead_id ? parseInt(body.lead_id) : null;

  const resultado = {
    etapa1_planilha: { processados: 0, atualizados: 0, erros: 0 },
    etapa2_tutts: { verificados: 0, atualizados: 0, erros: 0 },
    etapa3_followups: { criados: 0, mortos: 0, ressuscitados: 0, erros: 0 },
    tempo_ms: 0,
    modo: leadIdEspecifico ? 'evento' : 'cron',
  };

  try {
    // ============================================
    // BUSCAR LEADS QUE PRECISAM DE ENRIQUECIMENTO
    // ============================================
    let leads: any[] = [];

    if (leadIdEspecifico) {
      // Modo evento: só 1 lead
      const { data } = await client
        .from('dados_cliente')
        .select('*')
        .eq('id', leadIdEspecifico)
        .single();
      if (data) leads = [data];
    } else {
      // Modo cron: leads que nunca foram enriquecidos ou cooldown expirou
      const cooldownDate = new Date(Date.now() - ENRICHMENT_COOLDOWN_MIN * 60 * 1000).toISOString();

      // Prioridade 1: nunca enriquecidos (last_enriched_at IS NULL)
      const { data: nuncaEnriquecidos } = await client
        .from('dados_cliente')
        .select('*')
        .eq('status', 'ativo')
        .is('last_enriched_at', null)
        .limit(LIMITE_TUTTS_POR_EXECUCAO);

      // Prioridade 2: enriquecidos há mais de 30min (novos e qualificados primeiro)
      const { data: precisamAtualizar } = await client
        .from('dados_cliente')
        .select('*')
        .eq('status', 'ativo')
        .in('stage', ['novo', 'qualificado', 'lead_morto'])
        .lt('last_enriched_at', cooldownDate)
        .order('last_enriched_at', { ascending: true })
        .limit(LIMITE_TUTTS_POR_EXECUCAO - (nuncaEnriquecidos?.length || 0));

      leads = [...(nuncaEnriquecidos || []), ...(precisamAtualizar || [])];

      // Deduplicar por id
      const idsVistos = new Set<number>();
      leads = leads.filter(l => {
        if (idsVistos.has(l.id)) return false;
        idsVistos.add(l.id);
        return true;
      });
    }

    console.log(`[CRON] Modo: ${resultado.modo} | Leads a processar: ${leads.length}`);

    if (leads.length === 0) {
      resultado.tempo_ms = Date.now() - inicio;
      return NextResponse.json({
        success: true,
        data: resultado,
        message: 'Nenhum lead precisando de enriquecimento',
      });
    }

    // ============================================
    // ETAPA 1: ENRIQUECER PELA PLANILHA
    // ============================================
    console.log('[CRON] Etapa 1: Carregando planilhas...');

    // Planilha principal
    const mapaPlanilha = new Map<string, any>();
    try {
      const resp = await fetch(PLANILHA_CSV_URL, { headers: { 'Accept': 'text/csv' } });
      if (resp.ok) {
        const csv = await resp.text();
        const dados = parseCSV(csv);
        dados.forEach(row => {
          const codigo = row['codigo'] || row['cod'] || '';
          const nome = row['nome'] || row['name'] || '';
          const telefone = row['telefone'] || row['phone'] || row['tel'] || '';
          const cidade = row['cidade'] || row['city'] || row['regiao'] || '';
          const dataAtivRaw = row['data ativacao'] || row['data_ativacao'] || '';
          if (telefone) {
            const norm = normalizarTelefone(telefone);
            if (norm) {
              mapaPlanilha.set(norm, {
                codigo, nome, telefone: norm,
                cidade: cidade.toUpperCase(),
                dataAtivacao: parseDataBR(dataAtivRaw),
              });
            }
          }
        });
        console.log(`[CRON] Planilha principal: ${mapaPlanilha.size} registros`);
      }
    } catch (e: any) {
      console.error('[CRON] Erro planilha principal:', e.message);
    }

    // Planilha TP
    const mapaTP = new Map<string, string>();
    try {
      const resp = await fetch(PLANILHA_TP_URL, { headers: { 'Accept': 'text/csv' } });
      if (resp.ok) {
        const csv = await resp.text();
        const dados = parseCSV(csv);
        dados.forEach(row => {
          const telefone = row['phone'] || row['telefone'] || '';
          const tp = row['tp'] || '';
          if (telefone && tp) {
            const norm = normalizarTelefone(telefone);
            if (norm) mapaTP.set(norm, tp.trim());
          }
        });
        console.log(`[CRON] Planilha TP: ${mapaTP.size} registros`);
      }
    } catch (e: any) {
      console.error('[CRON] Erro planilha TP:', e.message);
    }

    // Processar cada lead
    for (const lead of leads) {
      if (!lead.telefone) continue;
      resultado.etapa1_planilha.processados++;

      try {
        const variacoes = gerarVariacoesTelefone(lead.telefone);
        const updateData: any = {};

        // Cruzar com planilha principal
        let encontrouPlanilha = false;
        for (const v of variacoes) {
          const dados = mapaPlanilha.get(v);
          if (dados) {
            if (dados.cidade) updateData.regiao = dados.cidade;
            if (dados.nome) updateData.nomewpp = dados.nome;
            if (dados.codigo) updateData.cod_profissional = dados.codigo;
            if (dados.dataAtivacao) updateData.data_ativacao = dados.dataAtivacao;
            encontrouPlanilha = true;
            break;
          }
        }

        // Cruzar com planilha TP
        for (const v of variacoes) {
          const tp = mapaTP.get(v);
          if (tp) {
            const tagsAtuais: string[] = Array.isArray(lead.tags) ? lead.tags : [];
            if (!tagsAtuais.includes(tp)) {
              updateData.tags = [...tagsAtuais, tp];
            }
            break;
          }
        }

        // Aplicar update se teve mudanças
        if (Object.keys(updateData).length > 0) {
          updateData.updated_at = new Date().toISOString();
          await client.from('dados_cliente').update(updateData).eq('id', lead.id);
          resultado.etapa1_planilha.atualizados++;

          // Atualizar lead local pra etapa 2 usar dados frescos
          Object.assign(lead, updateData);
        }
      } catch (e: any) {
        resultado.etapa1_planilha.erros++;
        console.error(`[CRON E1] Lead ${lead.id}:`, e.message);
      }
    }

    console.log(`[CRON] Etapa 1 concluída:`, resultado.etapa1_planilha);

    // ============================================
    // ETAPA 2: VERIFICAR API TUTTS
    // ============================================
    console.log('[CRON] Etapa 2: Verificando API Tutts...');

    // Só verifica leads que não estão finalizados e têm telefone
    const leadsTutts = leads.filter(l =>
      l.telefone && l.stage !== 'finalizado'
    ).slice(0, LIMITE_TUTTS_POR_EXECUCAO);

    for (const lead of leadsTutts) {
      resultado.etapa2_tutts.verificados++;

      try {
        const statusTutts = await verificarStatusProfissional(lead.telefone);
        const novoStage = determinarNovoStage(statusTutts, lead.stage);

        if (novoStage && novoStage !== lead.stage) {
          console.log(`[CRON E2] Lead ${lead.id}: ${lead.stage} → ${novoStage}`);

          const updateStage: any = {
            stage: novoStage,
            updated_at: new Date().toISOString(),
          };

          // Se era lead_morto e agora está ativo = ressuscitado
          if (lead.stage === 'lead_morto' && novoStage === 'finalizado') {
            updateStage.ressuscitado_em = new Date().toISOString();
            updateStage.vezes_ressuscitado = (lead.vezes_ressuscitado || 0) + 1;
            resultado.etapa3_followups.ressuscitados++;
          }

          await client.from('dados_cliente').update(updateStage).eq('id', lead.id);
          lead.stage = novoStage; // Atualizar local
          resultado.etapa2_tutts.atualizados++;
        }

        // Delay entre chamadas
        await new Promise(r => setTimeout(r, DELAY_ENTRE_CHAMADAS_MS));
      } catch (e: any) {
        resultado.etapa2_tutts.erros++;
        console.error(`[CRON E2] Lead ${lead.id}:`, e.message);
      }
    }

    // Marcar todos como enriquecidos
    const idsProcessados = leads.map(l => l.id);
    if (idsProcessados.length > 0) {
      await client
        .from('dados_cliente')
        .update({ last_enriched_at: new Date().toISOString() })
        .in('id', idsProcessados);
    }

    console.log(`[CRON] Etapa 2 concluída:`, resultado.etapa2_tutts);

    // ============================================
    // ETAPA 3: AUTOMAÇÃO DE FOLLOW-UPS
    // (só no modo cron, não no modo evento)
    // ============================================
    if (!leadIdEspecifico) {
      console.log('[CRON] Etapa 3: Automação de follow-ups...');

      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];

      // Buscar leads ativos que podem precisar de follow-up
      const { data: leadsFollowup } = await client
        .from('dados_cliente')
        .select('*')
        .eq('status', 'ativo')
        .in('stage', ['novo', 'qualificado']);

      for (const lead of leadsFollowup || []) {
        try {
          // Buscar follow-ups do lead
          const { data: followups } = await client
            .from('followups')
            .select('*')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false });

          const followupPendente = followups?.find((f: any) => f.status === 'pendente');
          const ultimoConcluido = followups?.find((f: any) => f.status === 'concluido');

          // CHECK: follow-up atrasado 2+ dias → lead_morto
          if (followupPendente) {
            const dataAgendada = new Date(followupPendente.data_agendada);
            const diasAtrasado = Math.floor((hoje.getTime() - dataAgendada.getTime()) / (1000 * 60 * 60 * 24));

            if (diasAtrasado >= PRAZOS.FOLLOWUP_NAO_ATENDIDO) {
              await client.from('dados_cliente')
                .update({ stage: 'lead_morto', updated_at: new Date().toISOString() })
                .eq('id', lead.id);
              await client.from('followups')
                .update({ status: 'cancelado' })
                .eq('id', followupPendente.id);
              resultado.etapa3_followups.mortos++;
              console.log(`[CRON E3] Lead ${lead.id} → lead_morto (follow-up atrasado ${diasAtrasado}d)`);
              continue;
            }

            // Já tem pendente e não está atrasado demais → pular
            continue;
          }

          // Sem follow-up pendente → verificar se precisa criar
          const dataRef = new Date(lead.updated_at || lead.created_at);
          const diasParado = Math.floor((hoje.getTime() - dataRef.getTime()) / (1000 * 60 * 60 * 24));

          let deveCriar = false;
          let motivo = '';

          // Lead NOVO parado 3+ dias
          if (lead.stage === 'novo' && diasParado >= PRAZOS.NOVO_SEM_MUDANCA) {
            deveCriar = true;
            motivo = MOTIVOS.NOVO;
          }

          // Lead QUALIFICADO parado 3+ dias
          if (lead.stage === 'qualificado' && diasParado >= PRAZOS.QUALIFICADO_SEM_FINALIZAR) {
            deveCriar = true;
            motivo = MOTIVOS.QUALIFICADO;
          }

          // Follow-up concluído há 5+ dias e ainda não finalizou
          if (ultimoConcluido && !followupPendente) {
            const dataConclusao = new Date(ultimoConcluido.completed_at);
            const diasDesdeConclusao = Math.floor((hoje.getTime() - dataConclusao.getTime()) / (1000 * 60 * 60 * 24));
            if (diasDesdeConclusao >= PRAZOS.APOS_FOLLOWUP_CONCLUIDO) {
              deveCriar = true;
              motivo = lead.stage === 'novo' ? MOTIVOS.NOVO : MOTIVOS.QUALIFICADO;
            }
          }

          if (deveCriar && motivo) {
            const maxSeq = followups?.reduce((max: number, f: any) => Math.max(max, f.sequencia || 1), 0) || 0;
            const dataFollowup = new Date(hoje);
            dataFollowup.setDate(dataFollowup.getDate() + 1);

            await client.from('followups').insert({
              lead_id: lead.id,
              data_agendada: dataFollowup.toISOString().split('T')[0],
              motivo,
              tipo: 'automatico',
              sequencia: maxSeq + 1,
            });
            resultado.etapa3_followups.criados++;
            console.log(`[CRON E3] Follow-up criado para lead ${lead.id}: "${motivo}"`);
          }
        } catch (e: any) {
          resultado.etapa3_followups.erros++;
          console.error(`[CRON E3] Lead ${lead.id}:`, e.message);
        }
      }

      console.log(`[CRON] Etapa 3 concluída:`, resultado.etapa3_followups);
    }

    resultado.tempo_ms = Date.now() - inicio;
    console.log(`[CRON] ✅ Concluído em ${resultado.tempo_ms}ms`, resultado);

    return NextResponse.json({
      success: true,
      data: resultado,
      message: resultado.modo === 'evento'
        ? `Lead enriquecido em ${resultado.tempo_ms}ms`
        : `CRON executado: ${resultado.etapa1_planilha.atualizados} enriquecidos, ${resultado.etapa2_tutts.atualizados} stages atualizados, ${resultado.etapa3_followups.criados} follow-ups criados`,
    });

  } catch (error: any) {
    console.error('[CRON] ERRO:', error);
    return NextResponse.json(
      { error: 'Erro no enriquecimento', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// GET para verificar status do cron
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;

    // Contar leads por estado de enriquecimento
    const { count: nunca } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .is('last_enriched_at', null);

    const cooldownDate = new Date(Date.now() - ENRICHMENT_COOLDOWN_MIN * 60 * 1000).toISOString();

    const { count: desatualizados } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .lt('last_enriched_at', cooldownDate);

    const { count: atualizados } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .gte('last_enriched_at', cooldownDate);

    return NextResponse.json({
      success: true,
      data: {
        nunca_enriquecidos: nunca || 0,
        desatualizados: desatualizados || 0,
        atualizados: atualizados || 0,
        cooldown_minutos: ENRICHMENT_COOLDOWN_MIN,
        limite_por_execucao: LIMITE_TUTTS_POR_EXECUCAO,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
