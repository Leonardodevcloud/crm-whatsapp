// ===========================================
// API: /api/supervisao/auditar
// POST: roda heurística + IA nas conversas recentes da Tatiane
//
// Fluxo:
// 1. Busca mensagens AI recentes (últimas N horas, default 24h)
// 2. Aplica regras ATIVAS (regex / keywords / mensagem_longa)
// 3. Filtra mensagens já aprovadas (não mostrar de novo)
// 4. Envia mensagens flagadas pra Gemini analisar contexto
// 5. Retorna lista de flags com análise IA
//
// Body opcional: { horas: 24, max_mensagens: 200 }
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

interface Regra {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: 'regex' | 'keywords' | 'mensagem_longa';
  padrao: string;
  severidade: 'info' | 'atencao' | 'critico';
  ativa: boolean;
}

interface MensagemFlagada {
  flag_key: string;
  session_id: string;
  mensagem_created_at: string;
  conteudo: string;
  regra: { id: number; nome: string; descricao: string | null; severidade: string };
  trecho_problema?: string;
}

interface FlagEnriquecida extends MensagemFlagada {
  contexto: Array<{ tipo: string; conteudo: string; quando: string }>;
  analise_ia?: {
    e_problema: boolean;
    motivo: string;
    sugestao?: string;
  } | null;
  lead?: { id: number; nome: string | null; telefone: string | null; stage: string | null };
}

// Cria chave única pra cada flag (mensagem + regra)
function gerarFlagKey(sessionId: string, createdAt: string, regraId: number): string {
  return `${sessionId}|${createdAt}|${regraId}`;
}

// Aplica uma regra a uma mensagem. Retorna o trecho que casou ou null.
function aplicarRegra(regra: Regra, conteudo: string): string | null {
  if (!conteudo) return null;

  if (regra.tipo === 'regex') {
    try {
      const re = new RegExp(regra.padrao, 'i');
      const m = conteudo.match(re);
      return m ? m[0] : null;
    } catch {
      return null;
    }
  }

  if (regra.tipo === 'keywords') {
    const kws = regra.padrao.split(',').map(k => k.trim()).filter(Boolean);
    const lower = conteudo.toLowerCase();
    for (const kw of kws) {
      if (kw && lower.includes(kw.toLowerCase())) return kw;
    }
    return null;
  }

  if (regra.tipo === 'mensagem_longa') {
    const limite = parseInt(regra.padrao, 10);
    if (isNaN(limite)) return null;
    return conteudo.length > limite ? `${conteudo.length} chars` : null;
  }

  return null;
}

// Chama Gemini pra analisar contexto da mensagem flagada
async function analisarComGemini(
  mensagem: string,
  contexto: Array<{ tipo: string; conteudo: string }>,
  regra: Regra,
  trecho?: string
): Promise<{ e_problema: boolean; motivo: string; sugestao?: string } | null> {
  if (!GEMINI_API_KEY) return null;

  const contextoTxt = contexto.slice(-6).map(m =>
    `[${m.tipo === 'human' ? 'LEAD' : 'TATIANE'}]: ${m.conteudo}`
  ).join('\n');

  const prompt = `Você é um auditor de qualidade de uma assistente IA chamada "Tatiane" que conversa com motoboys autônomos pelo WhatsApp para o sistema Tutts (logística de entregas em Salvador/BA).

A Tatiane DEVE:
- Conversar sobre cadastro e ativação no app Tutts
- Tirar dúvidas sobre como começar a fazer entregas
- Encaminhar para humano quando não souber

A Tatiane NÃO DEVE:
- Inventar valores, preços, comissões
- Prometer prazos ou garantir resultados
- Falar sobre vínculo CLT, INSS, FGTS, salário (são autônomos)
- Dar informações fora do escopo do app

REGRA QUE FOI DISPARADA: "${regra.nome}"
DESCRIÇÃO DA REGRA: ${regra.descricao || 'sem descrição'}
TRECHO QUE CASOU: ${trecho || '(não identificado)'}

CONTEXTO DA CONVERSA (últimas mensagens):
${contextoTxt}

MENSAGEM DA TATIANE QUE FOI FLAGADA:
"${mensagem}"

Analise se esta mensagem da Tatiane é genuinamente um problema (alucinação, promessa indevida, fora de escopo, etc) ou se é um falso-positivo da regra heurística.

Responda APENAS em JSON puro (sem markdown, sem \`\`\`):
{
  "e_problema": true ou false,
  "motivo": "explicação breve em 1-2 frases",
  "sugestao": "o que a Tatiane deveria ter dito (opcional, só se for problema)"
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn(`[supervisao/auditar] Gemini ${resp.status}: ${txt.slice(0, 200)}`);
      return null;
    }

    const json = await resp.json();
    let texto: string = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Remove markdown code fences se vier
    texto = texto.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(texto);
      return {
        e_problema: !!parsed.e_problema,
        motivo: String(parsed.motivo || '').slice(0, 500),
        sugestao: parsed.sugestao ? String(parsed.sugestao).slice(0, 500) : undefined,
      };
    } catch {
      return { e_problema: true, motivo: texto.slice(0, 300) };
    }
  } catch (err: any) {
    console.warn('[supervisao/auditar] Gemini erro:', err.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const horas = Math.min(168, Math.max(1, parseInt(body.horas) || 24));
  const maxMensagens = Math.min(500, Math.max(10, parseInt(body.max_mensagens) || 200));
  const usarIA = body.usar_ia !== false; // default true

  const client = supabaseAdmin || supabase;
  const limite = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();

  // ============================================
  // 1. Carregar regras ativas
  // ============================================
  const { data: regrasRaw, error: errRegras } = await client
    .from('tatiane_supervisao_regras')
    .select('*')
    .eq('ativa', true);
  if (errRegras) {
    return NextResponse.json({ error: errRegras.message, success: false }, { status: 500 });
  }
  const regras: Regra[] = regrasRaw || [];
  if (regras.length === 0) {
    return NextResponse.json({
      success: true,
      data: { flags: [], total_mensagens: 0, total_regras: 0, info: 'Nenhuma regra ativa' },
    });
  }

  // 1.b. Carregar exceções ativas (regex que descartam flags)
  // ============================================
  const { data: excecoesRaw } = await client
    .from('tatiane_supervisao_excecoes')
    .select('id, regra_id, padrao_regex, nome')
    .eq('ativa', true);

  // Agrupa exceções por regra_id, pré-compiladas
  const excecoesPorRegra = new Map<number, Array<{ id: number; nome: string; regex: RegExp }>>();
  (excecoesRaw || []).forEach((e: any) => {
    try {
      const re = new RegExp(e.padrao_regex, 'i');
      if (!excecoesPorRegra.has(e.regra_id)) excecoesPorRegra.set(e.regra_id, []);
      excecoesPorRegra.get(e.regra_id)!.push({ id: e.id, nome: e.nome, regex: re });
    } catch {
      console.warn(`[auditar] Exceção #${e.id} com regex inválida, ignorando`);
    }
  });

  // Helper: confere se mensagem casa com alguma exceção da regra
  const mensagemCasaExcecao = (regraId: number, conteudo: string): { id: number; nome: string } | null => {
    const excs = excecoesPorRegra.get(regraId) || [];
    for (const exc of excs) {
      if (exc.regex.test(conteudo)) return { id: exc.id, nome: exc.nome };
    }
    return null;
  };

  // ============================================
  // 2. Carregar mensagens AI recentes (paginado)
  // ============================================
  const PAGE = 1000;
  let mensagens: Array<{ session_id: string; created_at: string; content: string }> = [];
  for (let p = 0; p < 10; p++) {
    const { data, error } = await client
      .from('tatiane_chat_histories')
      .select('session_id, created_at, content')
      .eq('message_type', 'ai')
      .gte('created_at', limite)
      .order('created_at', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error || !data || data.length === 0) break;
    mensagens = mensagens.concat(data as any);
    if (data.length < PAGE) break;
    if (mensagens.length >= maxMensagens) break;
  }
  mensagens = mensagens.slice(0, maxMensagens);

  // ============================================
  // 3. Aplicar regras + filtrar aprovadas + filtrar exceções
  // ============================================
  // Carregar todas aprovações pra esses session_ids
  const sessionIds = Array.from(new Set(mensagens.map(m => m.session_id)));
  let aprovacoesSet = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: aprov } = await client
      .from('tatiane_supervisao_aprovacoes')
      .select('flag_key')
      .in('session_id', sessionIds);
    aprovacoesSet = new Set((aprov || []).map((a: any) => a.flag_key));
  }

  const flagadas: MensagemFlagada[] = [];
  let descartadasPorExcecao = 0;
  for (const msg of mensagens) {
    for (const regra of regras) {
      const trecho = aplicarRegra(regra, msg.content || '');
      if (trecho) {
        const flagKey = gerarFlagKey(msg.session_id, msg.created_at, regra.id);
        if (aprovacoesSet.has(flagKey)) continue; // já aprovada, pula

        // Confere exceção
        const excecao = mensagemCasaExcecao(regra.id, msg.content || '');
        if (excecao) {
          descartadasPorExcecao++;
          continue;
        }

        flagadas.push({
          flag_key: flagKey,
          session_id: msg.session_id,
          mensagem_created_at: msg.created_at,
          conteudo: msg.content,
          regra: {
            id: regra.id,
            nome: regra.nome,
            descricao: regra.descricao,
            severidade: regra.severidade,
          },
          trecho_problema: trecho,
        });
      }
    }
  }

  // ============================================
  // 4. Enriquecer com contexto + IA
  // ============================================
  const flagsParaIA = flagadas.slice(0, 30); // limite de chamadas IA
  const sessionIdsFlag = Array.from(new Set(flagsParaIA.map(f => f.session_id)));

  // Carregar contexto (últimas 6 msgs por session)
  const contextoMap = new Map<string, Array<{ tipo: string; conteudo: string; quando: string }>>();
  if (sessionIdsFlag.length > 0) {
    const { data: ctx } = await client
      .from('tatiane_chat_histories')
      .select('session_id, message_type, content, created_at')
      .in('session_id', sessionIdsFlag)
      .order('created_at', { ascending: true })
      .limit(2000);
    (ctx || []).forEach((c: any) => {
      if (!contextoMap.has(c.session_id)) contextoMap.set(c.session_id, []);
      contextoMap.get(c.session_id)!.push({
        tipo: c.message_type,
        conteudo: c.content,
        quando: c.created_at,
      });
    });
  }

  // Carregar dados do lead via session_id (= chat_lid)
  const leadsMap = new Map<string, any>();
  if (sessionIdsFlag.length > 0) {
    const { data: leads } = await client
      .from('dados_cliente')
      .select('id, nomewpp, telefone, stage, chat_lid')
      .in('chat_lid', sessionIdsFlag);
    (leads || []).forEach((l: any) => {
      if (l.chat_lid) leadsMap.set(l.chat_lid, l);
    });
  }

  const flagsEnriquecidas: FlagEnriquecida[] = [];
  for (const f of flagsParaIA) {
    const contexto = contextoMap.get(f.session_id) || [];
    let analiseIA: any = null;

    if (usarIA && GEMINI_API_KEY) {
      // Pega só contexto até a mensagem flagada (não mostra futuro pra IA)
      const ctxFiltrado = contexto.filter(c =>
        new Date(c.quando).getTime() <= new Date(f.mensagem_created_at).getTime()
      );
      analiseIA = await analisarComGemini(
        f.conteudo,
        ctxFiltrado,
        regras.find(r => r.id === f.regra.id)!,
        f.trecho_problema
      );
    }

    const lead = leadsMap.get(f.session_id);
    flagsEnriquecidas.push({
      ...f,
      contexto: contexto.slice(-6),
      analise_ia: analiseIA,
      lead: lead ? {
        id: lead.id,
        nome: lead.nomewpp,
        telefone: lead.telefone,
        stage: lead.stage,
      } : undefined,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      flags: flagsEnriquecidas,
      total_mensagens: mensagens.length,
      total_regras: regras.length,
      total_flags_brutas: flagadas.length,
      total_flags_analisadas: flagsParaIA.length,
      descartadas_por_excecao: descartadasPorExcecao,
      truncado: flagadas.length > flagsParaIA.length,
      ia_disponivel: !!GEMINI_API_KEY && usarIA,
    },
  });
}
