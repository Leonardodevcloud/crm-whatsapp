// ===========================================
// API: /api/supervisao/correcoes/aplicar
// POST: aplica todas as correções pendentes ao system prompt da Tatiane
//
// Fluxo:
// 1. Busca prompt ativo (versão atual)
// 2. Busca correções status='pendente'
// 3. Insere as lições nas seções correspondentes do prompt
// 4. Cria nova versão (versao = atual+1, ativa=true)
// 5. Desativa versão anterior
// 6. Marca correções como 'aplicada' + versao_prompt_resultante
//
// Body opcional: { ids?: number[] } — só aplicar essas IDs (default: todas pendentes)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const LIMITE_TAMANHO_PROMPT = 20000; // chars — alarme acima disso
const SECOES_LABELS: Record<string, string> = {
  regras_ouro: '## Regras de Ouro',
  fora_escopo: '## Fora de Escopo',
  fluxo: '## Fluxo Obrigatório (siga nessa ordem, uma etapa por vez)',
  outro: '## Lições Aprendidas',
};

/**
 * Insere uma lista de lições numa seção específica do prompt.
 * Se a seção não existir (caso 'outro'), cria no final.
 */
function inserirLicoesNoPrompt(prompt: string, secao: string, licoes: string[]): string {
  if (licoes.length === 0) return prompt;

  const header = SECOES_LABELS[secao];
  const linhasNovas = licoes.map(l => `- ${l.trim()}`).join('\n');

  // Localiza a seção
  const idx = prompt.indexOf(header);
  if (idx === -1) {
    // Seção não existe — adiciona no final
    return prompt.trim() + '\n\n' + header + '\n' + linhasNovas + '\n';
  }

  // Acha o início da PRÓXIMA seção (próximo "## " após esse header)
  const aposHeader = idx + header.length;
  const proximaSecao = prompt.indexOf('\n## ', aposHeader);
  const fimSecao = proximaSecao === -1 ? prompt.length : proximaSecao;

  // Insere as linhas no fim da seção (antes da próxima seção)
  const antes = prompt.slice(0, fimSecao).trimEnd();
  const depois = prompt.slice(fimSecao);
  return antes + '\n' + linhasNovas + (depois ? '\n' + depois : '\n');
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const idsFiltro: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : [];

  const client = supabaseAdmin || supabase;
  const aplicadoPor = String(user.nome || user.codProfissional || 'desconhecido').slice(0, 200);

  try {
    // 1. Versão ativa atual
    const { data: ativa, error: errA } = await client
      .from('tatiane_system_prompt')
      .select('id, versao, prompt')
      .eq('ativa', true)
      .maybeSingle();

    if (errA || !ativa) {
      return NextResponse.json({
        error: errA?.message || 'Nenhuma versão ativa encontrada (rode a migration primeiro)',
        success: false
      }, { status: 500 });
    }

    // 2. Correções pendentes
    let queryCorrecoes = client
      .from('tatiane_correcoes_pendentes')
      .select('*')
      .eq('status', 'pendente');

    if (idsFiltro.length > 0) {
      queryCorrecoes = queryCorrecoes.in('id', idsFiltro);
    }

    const { data: pendentes, error: errP } = await queryCorrecoes;
    if (errP) {
      return NextResponse.json({ error: errP.message, success: false }, { status: 500 });
    }
    if (!pendentes || pendentes.length === 0) {
      return NextResponse.json({
        error: 'Nenhuma correção pendente para aplicar',
        success: false
      }, { status: 400 });
    }

    // 3. Agrupa por seção
    const porSecao: Record<string, string[]> = {};
    for (const c of pendentes) {
      const s = c.secao || 'regras_ouro';
      if (!porSecao[s]) porSecao[s] = [];
      porSecao[s].push(c.licao);
    }

    // 4. Constrói novo prompt
    let novoPrompt = ativa.prompt;
    for (const [secao, licoes] of Object.entries(porSecao)) {
      novoPrompt = inserirLicoesNoPrompt(novoPrompt, secao, licoes);
    }

    // 5. Verifica limite
    const aviso = novoPrompt.length > LIMITE_TAMANHO_PROMPT
      ? `Atenção: prompt está com ${novoPrompt.length} chars (limite recomendado: ${LIMITE_TAMANHO_PROMPT}). Considere consolidar lições.`
      : null;

    // 6. Desativa versão atual
    const { error: errD } = await client
      .from('tatiane_system_prompt')
      .update({ ativa: false })
      .eq('ativa', true);
    if (errD) {
      return NextResponse.json({ error: `Erro desativando: ${errD.message}`, success: false }, { status: 500 });
    }

    // 7. Cria nova versão ativa
    const novaVersao = ativa.versao + 1;
    const idsAplicadas = pendentes.map((c: any) => c.id);
    const resumoMud = `${pendentes.length} lições aplicadas: ${pendentes.slice(0, 3).map((p: any) => p.licao.slice(0, 40)).join(' | ')}${pendentes.length > 3 ? ' …' : ''}`;

    const { data: nova, error: errN } = await client
      .from('tatiane_system_prompt')
      .insert({
        versao: novaVersao,
        prompt: novoPrompt,
        ativa: true,
        criado_por: aplicadoPor,
        resumo_mudancas: resumoMud,
        correcoes_aplicadas: idsAplicadas,
      })
      .select()
      .single();

    if (errN) {
      // Tenta rollback: reativa anterior
      await client.from('tatiane_system_prompt').update({ ativa: true }).eq('id', ativa.id);
      return NextResponse.json({
        error: `Erro criando nova versão: ${errN.message}`,
        success: false
      }, { status: 500 });
    }

    // 8. Marca correções como aplicadas
    await client
      .from('tatiane_correcoes_pendentes')
      .update({
        status: 'aplicada',
        aplicada_em: new Date().toISOString(),
        versao_prompt_resultante: novaVersao,
      })
      .in('id', idsAplicadas);

    return NextResponse.json({
      success: true,
      data: {
        versao_anterior: ativa.versao,
        versao_nova: novaVersao,
        correcoes_aplicadas: pendentes.length,
        prompt_chars: novoPrompt.length,
        aviso,
        nova_versao_id: nova.id,
      }
    });
  } catch (e: any) {
    console.error('[aplicar] Exceção:', e);
    return NextResponse.json({ error: `Erro: ${e.message}`, success: false }, { status: 500 });
  }
}
