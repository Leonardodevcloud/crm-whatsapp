// ===========================================
// lib/profissionais-cadastro.ts
// Cliente para o endpoint do backend Central Tutts que unifica
// CRM (crm_leads_capturados) + planilha Google Sheets como fallback.
//
// Substitui o fetch direto à planilha CSV em todos os consumidores
// do CRM (api/profissionais, api/verificar-operacao, api/enriquecer,
// api/cron/enriquecimento, api/leads-captura/enriquecer).
// ===========================================

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export interface ProfissionalCadastro {
  codigo: string;
  nome: string;
  telefone: string;
  regiao: string;        // UPPERCASE
  cidade: string;
  dataAtivacao: string;  // ISO YYYY-MM-DD ou ''
  quemAtivou: string;    // UPPERCASE ou ''
  origem: 'crm' | 'planilha';
}

export interface ProfissionaisCadastroResponse {
  success: boolean;
  data: ProfissionalCadastro[];
  estatisticas: {
    total: number;
    por_origem?: { crm: number; planilha: number };
    porRegiao: Record<string, number>;
    porAtivador: Record<string, number>;
  };
  regioes: string[];
  ativadores: string[];
}

/**
 * Busca a lista completa de profissionais (CRM → planilha fallback)
 * via backend Central Tutts. Nunca lança — em erro devolve lista vazia
 * para manter o caller funcionando em fail-open.
 */
export async function fetchProfissionaisCadastro(): Promise<ProfissionaisCadastroResponse> {
  const empty: ProfissionaisCadastroResponse = {
    success: false,
    data: [],
    estatisticas: { total: 0, porRegiao: {}, porAtivador: {} },
    regioes: [],
    ativadores: [],
  };

  try {
    const resp = await fetch(`${BI_API_URL}/api/crm/profissionais-cadastro`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      cache: 'no-store',
    });

    if (!resp.ok) {
      console.error(`[profissionais-cadastro] Backend HTTP ${resp.status}`);
      return empty;
    }

    const data = await resp.json();
    if (!data || !Array.isArray(data.data)) {
      console.error('[profissionais-cadastro] Resposta malformada do backend');
      return empty;
    }

    return data as ProfissionaisCadastroResponse;
  } catch (err: any) {
    console.error('[profissionais-cadastro] Erro ao consultar backend:', err?.message || err);
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers de telefone (compartilhados por todos os consumidores)
// ─────────────────────────────────────────────────────────────────

/** Normaliza telefone para comparação (só dígitos, sem DDI, com 9 na frente). */
export function normalizarTelefone(telefone: string): string {
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

/** Gera variações do telefone (com/sem DDI, com/sem 9) para match robusto. */
export function gerarVariacoesTelefone(telefone: string): string[] {
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

/**
 * Cria índice telefone→profissional usando variações de telefone.
 * Útil pra os fluxos de enriquecimento por telefone.
 */
export function indexarProfissionaisPorTelefone(
  profissionais: ProfissionalCadastro[]
): Map<string, ProfissionalCadastro> {
  const mapa = new Map<string, ProfissionalCadastro>();
  for (const p of profissionais) {
    if (!p.telefone) continue;
    const variacoes = gerarVariacoesTelefone(p.telefone);
    for (const v of variacoes) {
      if (v && !mapa.has(v)) mapa.set(v, p);
    }
  }
  return mapa;
}

/** Cria índice código→profissional. */
export function indexarProfissionaisPorCodigo(
  profissionais: ProfissionalCadastro[]
): Map<string, ProfissionalCadastro> {
  const mapa = new Map<string, ProfissionalCadastro>();
  for (const p of profissionais) {
    if (p.codigo) mapa.set(String(p.codigo).trim(), p);
  }
  return mapa;
}
