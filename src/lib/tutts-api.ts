// ===========================================
// Integração com API Tutts - Status Profissional
// ===========================================

const TUTTS_API_URL = 'https://tutts.com.br/integracao';
const TUTTS_TOKEN = process.env.TUTTS_INTEGRACAO_TOKEN;

export interface TuttsStatusResponse {
  found: boolean;
  ativo: boolean | null; // true = ativo (S), false = inativo (N), null = não encontrado
  raw?: any;
  error?: string;
  telefoneEncontrado?: string; // qual formato funcionou
}

/**
 * Formatar telefone para o padrão esperado pela API Tutts
 * 
 * Formatos de entrada suportados:
 * - 5571989170372@s.whatsapp.net (WhatsApp)
 * - 5571989170372 (só dígitos com DDI)
 * - 71989170372 (só dígitos sem DDI)
 * - (71) 98917-0372 (já formatado)
 * - 71 98917-0372 (parcialmente formatado)
 * 
 * Formato de saída: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
function formatPhoneForTutts(phone: string): string {
  if (!phone) return '';
  
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '');
  
  console.log(`[Tutts Format] Input: "${phone}" -> Digits: "${digits}"`);
  
  // Remove o 55 do início se tiver (código do Brasil)
  let withoutCountry = digits;
  if (digits.startsWith('55') && digits.length >= 12) {
    withoutCountry = digits.slice(2);
  }
  
  console.log(`[Tutts Format] Sem DDI: "${withoutCountry}" (${withoutCountry.length} dígitos)`);
  
  // Celular com 9 dígitos: (XX) 9XXXX-XXXX = 11 dígitos total
  if (withoutCountry.length === 11) {
    const ddd = withoutCountry.slice(0, 2);
    const part1 = withoutCountry.slice(2, 7);
    const part2 = withoutCountry.slice(7);
    const formatted = `(${ddd}) ${part1}-${part2}`;
    console.log(`[Tutts Format] Celular 11 dígitos: "${formatted}"`);
    return formatted;
  }
  
  // Fixo ou celular antigo: (XX) XXXX-XXXX = 10 dígitos total
  if (withoutCountry.length === 10) {
    const ddd = withoutCountry.slice(0, 2);
    const part1 = withoutCountry.slice(2, 6);
    const part2 = withoutCountry.slice(6);
    const formatted = `(${ddd}) ${part1}-${part2}`;
    console.log(`[Tutts Format] Fixo 10 dígitos: "${formatted}"`);
    return formatted;
  }
  
  // Celular com 9 dígitos extras (alguns cadastros antigos): 12 dígitos
  if (withoutCountry.length === 12) {
    const ddd = withoutCountry.slice(0, 2);
    const part1 = withoutCountry.slice(2, 7);
    const part2 = withoutCountry.slice(7, 11);
    const formatted = `(${ddd}) ${part1}-${part2}`;
    console.log(`[Tutts Format] Celular 12 dígitos (truncado): "${formatted}"`);
    return formatted;
  }
  
  // Se já parece formatado (tem parênteses), retorna o original limpo
  if (phone.includes('(') && phone.includes(')')) {
    // Remove barras e espaços extras do final
    const cleaned = phone.replace(/\s*\/\s*$/, '').trim();
    console.log(`[Tutts Format] Já formatado: "${cleaned}"`);
    return cleaned;
  }
  
  // Se não conseguir formatar, retorna só os dígitos
  console.log(`[Tutts Format] Não formatado, retornando dígitos: "${withoutCountry}"`);
  return withoutCountry;
}

/**
 * Gerar variações do telefone para busca
 * Adiciona/remove o 9 do celular para cobrir formatos antigos e novos
 * 
 * Exemplo:
 * - (85) 8593-7856 -> [(85) 8593-7856, (85) 98593-7856]
 * - (85) 98593-7856 -> [(85) 98593-7856, (85) 8593-7856]
 * - (85) 3257-2058 -> [(85) 3257-2058] (fixo, não adiciona 9)
 */
function gerarVariacoesTelefone(telefoneFormatado: string): string[] {
  const variacoes: string[] = [telefoneFormatado];
  
  // Extrai DDD e número
  const match = telefoneFormatado.match(/\((\d{2})\)\s*(\d{4,5})-(\d{4})/);
  if (!match) {
    return variacoes;
  }
  
  const ddd = match[1];
  const parte1 = match[2];
  const parte2 = match[3];
  
  // Se tem 4 dígitos na primeira parte (formato antigo)
  // Só adiciona 9 se parecer celular (começa com 6, 7, 8 ou 9)
  if (parte1.length === 4) {
    const primeiroDigito = parte1[0];
    if (['6', '7', '8', '9'].includes(primeiroDigito)) {
      const comNove = `(${ddd}) 9${parte1}-${parte2}`;
      variacoes.push(comNove);
      console.log(`[Tutts Variações] Adicionando formato com 9: "${comNove}"`);
    }
  }
  
  // Se tem 5 dígitos e começa com 9, tenta sem o 9
  if (parte1.length === 5 && parte1.startsWith('9')) {
    const semNove = `(${ddd}) ${parte1.slice(1)}-${parte2}`;
    variacoes.push(semNove);
    console.log(`[Tutts Variações] Adicionando formato sem 9: "${semNove}"`);
  }
  
  return variacoes;
}

/**
 * Fazer requisição para API Tutts
 */
async function consultarApiTutts(celular: string): Promise<{sucesso: boolean; ativo?: string; erro?: string; raw?: any}> {
  try {
    const response = await fetch(TUTTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TUTTS_TOKEN}`,
        'identificador': 'prof-status',
      },
      body: JSON.stringify({ celular }),
    });

    const data = await response.json();
    console.log(`[Tutts API] Resposta para "${celular}":`, JSON.stringify(data));

    if (data.Sucesso && Array.isArray(data.Sucesso) && data.Sucesso.length > 0) {
      return { sucesso: true, ativo: data.Sucesso[0].ativo, raw: data };
    }

    return { sucesso: false, erro: data.Erro, raw: data };
  } catch (error: any) {
    console.error(`[Tutts API] Erro na requisição para "${celular}":`, error);
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Consultar status do profissional na API Tutts
 * Tenta múltiplas variações do telefone (com e sem o 9)
 * 
 * @param telefone - Telefone do lead (qualquer formato)
 * @returns Status do profissional
 */
export async function verificarStatusProfissional(telefone: string): Promise<TuttsStatusResponse> {
  if (!TUTTS_TOKEN) {
    console.error('[Tutts API] Token não configurado');
    return {
      found: false,
      ativo: null,
      error: 'Token da API Tutts não configurado',
    };
  }

  if (!telefone) {
    return {
      found: false,
      ativo: null,
      error: 'Telefone não informado',
    };
  }

  // Formatar telefone
  const celularFormatado = formatPhoneForTutts(telefone);
  
  // Gerar variações (com e sem o 9)
  const variacoes = gerarVariacoesTelefone(celularFormatado);
  
  console.log(`[Tutts API] Tentando ${variacoes.length} variações:`, variacoes);

  // Tentar cada variação até encontrar
  for (const variacao of variacoes) {
    console.log(`[Tutts API] Consultando: "${variacao}"`);
    
    const resultado = await consultarApiTutts(variacao);
    
    if (resultado.sucesso) {
      console.log(`[Tutts API] ✅ Encontrado com: "${variacao}" -> ativo: ${resultado.ativo}`);
      return {
        found: true,
        ativo: resultado.ativo === 'S',
        raw: resultado.raw,
        telefoneEncontrado: variacao,
      };
    }
    
    console.log(`[Tutts API] ❌ Não encontrado com: "${variacao}"`);
  }

  // Nenhuma variação encontrou
  console.log(`[Tutts API] Nenhuma variação encontrou o profissional`);
  return {
    found: false,
    ativo: null,
    error: 'Nenhum profissional encontrado com os dados informados',
  };
}

/**
 * Determinar qual stage o lead deve ter baseado no status do Tutts
 * 
 * Estágios disponíveis: novo, qualificado, finalizado
 * 
 * @param statusTutts - Resposta da API Tutts
 * @param stageAtual - Stage atual do lead
 * @returns Novo stage ou null se não deve mudar
 */
export function determinarNovoStage(
  statusTutts: TuttsStatusResponse,
  stageAtual: string
): string | null {
  // Se não encontrou na API, mantém o stage atual
  if (!statusTutts.found) {
    return null;
  }

  // Se já está finalizado, não muda
  if (stageAtual === 'finalizado') {
    return null;
  }

  // Profissional ATIVO (S) -> Finalizado
  if (statusTutts.ativo === true) {
    console.log('[Tutts] Profissional ATIVO -> stage: finalizado');
    return 'finalizado';
  }

  // Profissional INATIVO (N) -> Qualificado
  if (statusTutts.ativo === false) {
    console.log('[Tutts] Profissional INATIVO -> stage: qualificado');
    return 'qualificado';
  }

  return null;
}
