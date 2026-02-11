// ===========================================
// API: /api/leads-nao-iniciados
// POST: Recebe lista de leads e salva os que NÃO estão no CRM
// GET: Retorna leads salvos que ainda não estão no CRM
// DELETE: Remove um lead específico ou limpa todos
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// Token da API Tutts (mesmo usado em outras integrações)
const TUTTS_API_TOKEN = process.env.TUTTS_INTEGRACAO_TOKEN || process.env.TUTTS_API_TOKEN || '';

// Função para verificar status do profissional na API Tutts
async function verificarStatusProfissional(telefone: string): Promise<'S' | 'N' | null> {
  if (!TUTTS_API_TOKEN) {
    console.log('[Tutts API] Token não configurado');
    return null;
  }

  try {
    // Formatar telefone para o padrão esperado pela API
    const numeros = telefone.replace(/\D/g, '');
    let celularFormatado = numeros;
    
    // Formato: (XX) XXXXX-XXXX
    if (numeros.length === 11) {
      celularFormatado = `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    } else if (numeros.length === 10) {
      celularFormatado = `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }

    const response = await fetch('https://tutts.com.br/integracao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TUTTS_API_TOKEN}`,
        'identificador': 'prof-status',
      },
      body: JSON.stringify({ celular: celularFormatado }),
    });

    if (!response.ok) {
      console.log(`[Tutts API] Erro HTTP: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.Sucesso && data.Sucesso[0]) {
      return data.Sucesso[0].ativo as 'S' | 'N';
    }
    
    if (data.Erro) {
      // "Nenhum profissional encontrado" não é erro, significa que não está cadastrado
      if (data.Erro.includes('Nenhum profissional encontrado')) {
        return 'N'; // Não está ativo
      }
      console.log(`[Tutts API] Erro: ${data.Erro}`);
    }
    
    return null;
  } catch (error) {
    console.error('[Tutts API] Erro ao verificar:', error);
    return null;
  }
}

// Função para converter data no formato BR (DD/MM/YYYY) para formato ISO (YYYY-MM-DD)
function parseDataBR(dataStr: string): string | null {
  if (!dataStr) return null;
  
  // Tentar diferentes formatos
  // Formato DD/MM/YYYY ou DD-MM-YYYY
  const partes = dataStr.split(/[\/\-]/);
  if (partes.length === 3) {
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    let ano = partes[2];
    
    // Se ano tem 2 dígitos, assumir 2000+
    if (ano.length === 2) {
      ano = '20' + ano;
    }
    
    // Validar se é uma data válida
    const dataISO = `${ano}-${mes}-${dia}`;
    const dataObj = new Date(dataISO);
    if (!isNaN(dataObj.getTime())) {
      return dataISO;
    }
  }
  
  return null;
}

// Mapeamento de DDD para Região
const DDD_REGIAO: Record<string, string> = {
  // Nordeste
  '71': 'SALVADOR',
  '73': 'ILHÉUS',
  '74': 'JUAZEIRO',
  '75': 'FEIRA DE SANTANA',
  '77': 'BARREIRAS',
  '81': 'RECIFE',
  '87': 'PETROLINA',
  '82': 'MACEIÓ',
  '83': 'JOÃO PESSOA',
  '84': 'NATAL',
  '85': 'FORTALEZA',
  '86': 'TERESINA',
  '88': 'JUAZEIRO DO NORTE',
  '89': 'PICOS',
  '79': 'ARACAJU',
  '98': 'SÃO LUÍS',
  '99': 'IMPERATRIZ',
  
  // Sudeste
  '11': 'SÃO PAULO',
  '12': 'SÃO JOSÉ DOS CAMPOS',
  '13': 'SANTOS',
  '14': 'BAURU',
  '15': 'SOROCABA',
  '16': 'RIBEIRÃO PRETO',
  '17': 'SÃO JOSÉ DO RIO PRETO',
  '18': 'PRESIDENTE PRUDENTE',
  '19': 'CAMPINAS',
  '21': 'RIO DE JANEIRO',
  '22': 'CAMPOS DOS GOYTACAZES',
  '24': 'VOLTA REDONDA',
  '27': 'VITÓRIA',
  '28': 'CACHOEIRO DE ITAPEMIRIM',
  '31': 'BELO HORIZONTE',
  '32': 'JUIZ DE FORA',
  '33': 'GOVERNADOR VALADARES',
  '34': 'UBERLÂNDIA',
  '35': 'POÇOS DE CALDAS',
  '37': 'DIVINÓPOLIS',
  '38': 'MONTES CLAROS',
  
  // Centro-Oeste
  '61': 'BRASÍLIA',
  '62': 'GOIÂNIA',
  '63': 'PALMAS',
  '64': 'RIO VERDE',
  '65': 'CUIABÁ',
  '66': 'RONDONÓPOLIS',
  '67': 'CAMPO GRANDE',
  
  // Sul
  '41': 'CURITIBA',
  '42': 'PONTA GROSSA',
  '43': 'LONDRINA',
  '44': 'MARINGÁ',
  '45': 'FOZ DO IGUAÇU',
  '46': 'FRANCISCO BELTRÃO',
  '47': 'JOINVILLE',
  '48': 'FLORIANÓPOLIS',
  '49': 'CHAPECÓ',
  '51': 'PORTO ALEGRE',
  '53': 'PELOTAS',
  '54': 'CAXIAS DO SUL',
  '55': 'SANTA MARIA',
  
  // Norte
  '68': 'RIO BRANCO',
  '69': 'PORTO VELHO',
  '91': 'BELÉM',
  '92': 'MANAUS',
  '93': 'SANTARÉM',
  '94': 'MARABÁ',
  '95': 'BOA VISTA',
  '96': 'MACAPÁ',
  '97': 'COARI',
};

// Normaliza telefone para comparação
function normalizarTelefone(telefone: string): string {
  if (!telefone) return '';
  
  // Remove tudo que não é número
  let numeros = telefone.replace(/\D/g, '');
  
  // Remove código do país (55) se tiver
  if (numeros.length >= 12 && numeros.startsWith('55')) {
    numeros = numeros.substring(2);
  }
  
  // Garante 11 dígitos (com 9 na frente)
  if (numeros.length === 10) {
    numeros = numeros.substring(0, 2) + '9' + numeros.substring(2);
  }
  
  return numeros;
}

// Extrai DDD do telefone
function extrairDDD(telefone: string): string {
  const normalizado = normalizarTelefone(telefone);
  return normalizado.substring(0, 2);
}

// Obtém região pelo DDD
function obterRegiaoPorDDD(telefone: string): string {
  const ddd = extrairDDD(telefone);
  return DDD_REGIAO[ddd] || `DDD ${ddd}`;
}

// Gera variações do telefone para busca
function gerarVariacoesTelefone(telefone: string): string[] {
  const normalizado = normalizarTelefone(telefone);
  if (!normalizado) return [];
  
  const variacoes: string[] = [
    normalizado,
    '55' + normalizado,
  ];
  
  // Sem o 9 (telefone antigo)
  if (normalizado.length === 11) {
    const sem9 = normalizado.substring(0, 2) + normalizado.substring(3);
    variacoes.push(sem9);
    variacoes.push('55' + sem9);
  }
  
  // Com formatação
  if (normalizado.length === 11) {
    variacoes.push(`(${normalizado.substring(0, 2)}) ${normalizado.substring(2, 7)}-${normalizado.substring(7)}`);
  }
  
  return variacoes;
}

export interface LeadNaoIniciado {
  id: number;
  codigo: string;
  nome: string;
  telefone: string;
  telefone_normalizado: string;
  regiao: string;
  whatsappLink: string;
  created_at: string;
  data_cadastro: string | null;
}

// POST: Receber lista de leads, filtrar e SALVAR no banco
// TAMBÉM enriquece leads existentes no CRM (novo/qualificado)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const body = await req.json();
    const { leads } = body as { leads: Array<{ codigo: string; nome: string; telefone: string; data_ativacao?: string; data_cadastro?: string }> };

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: 'Lista de leads é obrigatória', success: false },
        { status: 400 }
      );
    }

    console.log(`[LeadsNaoIniciados] Recebidos ${leads.length} leads para verificar`);

    // Buscar todos os leads do CRM (novo e qualificado) com telefone
    const { data: leadsCRM, error: errorCRM } = await client
      .from('dados_cliente')
      .select('id, telefone, nomewpp, cod_profissional')
      .in('stage', ['novo', 'qualificado']);

    if (errorCRM) throw errorCRM;

    // Criar mapa de telefone -> lead do CRM
    const mapaCRM = new Map<string, { id: number; telefone: string; nomewpp: string; cod_profissional: string }>();
    (leadsCRM || []).forEach(lead => {
      if (lead.telefone) {
        const variacoes = gerarVariacoesTelefone(lead.telefone);
        variacoes.forEach(v => mapaCRM.set(v, lead));
      }
    });

    console.log(`[LeadsNaoIniciados] ${mapaCRM.size} variações de telefone no CRM`);

    // Contadores
    let jaNoCRM = 0;
    let enriquecidos = 0;
    const leadsParaInserir: Array<{
      codigo: string;
      nome: string;
      telefone: string;
      telefone_normalizado: string;
      regiao: string;
      uploaded_by: number;
      data_cadastro: string;
    }> = [];

    for (const lead of leads) {
      if (!lead.telefone) continue;

      const telefoneNormalizado = normalizarTelefone(lead.telefone);
      if (!telefoneNormalizado) continue;

      const variacoes = gerarVariacoesTelefone(lead.telefone);
      
      // Verificar se alguma variação existe no CRM
      let leadCRM = null;
      for (const v of variacoes) {
        if (mapaCRM.has(v)) {
          leadCRM = mapaCRM.get(v);
          break;
        }
      }

      if (leadCRM) {
        // Lead JÁ existe no CRM → ENRIQUECER
        jaNoCRM++;
        
        const updateData: any = {};
        
        // Atualizar nome se veio na planilha e é diferente
        if (lead.nome && lead.nome !== leadCRM.nomewpp) {
          updateData.nomewpp = lead.nome;
        }
        
        // Atualizar código do profissional se veio na planilha
        if (lead.codigo && lead.codigo !== leadCRM.cod_profissional) {
          updateData.cod_profissional = lead.codigo;
        }
        
        // Atualizar região baseada no DDD do telefone
        const regiao = obterRegiaoPorDDD(lead.telefone);
        if (regiao && !regiao.startsWith('DDD')) {
          updateData.regiao = regiao;
        }
        
        // Atualizar data de ativação se veio na planilha (formato DD/MM/YYYY)
        if (lead.data_ativacao) {
          const dataAtivacao = parseDataBR(lead.data_ativacao);
          if (dataAtivacao) {
            updateData.data_ativacao = dataAtivacao;
          }
        }
        
        // Só atualiza se tiver algo para atualizar
        if (Object.keys(updateData).length > 0) {
          updateData.updated_at = new Date().toISOString();
          
          const { error: updateError } = await client
            .from('dados_cliente')
            .update(updateData)
            .eq('id', leadCRM.id);
          
          if (!updateError) {
            enriquecidos++;
            console.log(`[LeadsNaoIniciados] Lead ${leadCRM.id} enriquecido:`, updateData);
          }
        }
      } else {
        // Lead NÃO existe no CRM → adicionar na lista de não iniciados
        const regiao = obterRegiaoPorDDD(lead.telefone);

        leadsParaInserir.push({
          codigo: lead.codigo || '',
          nome: lead.nome || '',
          telefone: lead.telefone,
          telefone_normalizado: telefoneNormalizado,
          regiao,
          uploaded_by: user.id,
          data_cadastro: lead.data_cadastro || lead.data_ativacao || '',
        });
      }
    }

    console.log(`[LeadsNaoIniciados] ${leadsParaInserir.length} leads para inserir, ${jaNoCRM} já no CRM, ${enriquecidos} enriquecidos`);

    // Inserir no banco (ignorar duplicados)
    let inseridos = 0;
    let duplicados = 0;

    for (const lead of leadsParaInserir) {
      const { error: insertError } = await client
        .from('leads_nao_iniciados')
        .upsert(lead, { 
          onConflict: 'telefone_normalizado',
          ignoreDuplicates: true 
        });

      if (insertError) {
        if (insertError.code === '23505') {
          duplicados++;
        } else {
          console.error('[LeadsNaoIniciados] Erro ao inserir:', insertError);
        }
      } else {
        inseridos++;
      }
    }

    // Buscar total após inserção
    const { count } = await client
      .from('leads_nao_iniciados')
      .select('*', { count: 'exact', head: true });

    // Estatísticas por região
    const porRegiao: Record<string, number> = {};
    leadsParaInserir.forEach(l => {
      porRegiao[l.regiao] = (porRegiao[l.regiao] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        totalRecebidos: leads.length,
        jaNoCRM,
        enriquecidos,
        novosInseridos: inseridos,
        duplicados,
        totalNaLista: count || 0,
        porRegiao,
      },
      message: `${inseridos} novos leads adicionados | ${enriquecidos} leads enriquecidos no CRM`,
    });

  } catch (error: any) {
    console.error('[LeadsNaoIniciados] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao processar leads', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// GET: Listar leads não iniciados (remove automaticamente os que entraram no CRM ou estão ativos na Tutts)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);
    const verificarTutts = searchParams.get('verificar_tutts') === 'true';
    const limiteTutts = parseInt(searchParams.get('limite_tutts') || '10'); // Verifica apenas X leads por vez

    // 1. Buscar todos os leads não iniciados
    const { data: leadsNaoIniciados, error: errorLeads } = await client
      .from('leads_nao_iniciados')
      .select('*')
      .order('created_at', { ascending: false });

    if (errorLeads) throw errorLeads;

    if (!leadsNaoIniciados || leadsNaoIniciados.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          leads: [],
          total: 0,
          removidos: 0,
          removidosTutts: 0,
          porRegiao: {},
          regioes: [],
        },
      });
    }

    // 2. Buscar telefones do CRM para verificar quem já entrou
    const { data: leadsCRM, error: errorCRM } = await client
      .from('dados_cliente')
      .select('telefone')
      .in('stage', ['novo', 'qualificado', 'finalizado']);

    if (errorCRM) throw errorCRM;

    // Criar Set com telefones do CRM
    const telefonesCRM = new Set<string>();
    (leadsCRM || []).forEach(lead => {
      if (lead.telefone) {
        const variacoes = gerarVariacoesTelefone(lead.telefone);
        variacoes.forEach(v => telefonesCRM.add(v));
      }
    });

    // 3. Separar leads que ainda não estão no CRM dos que já entraram
    const leadsParaVerificarTutts: typeof leadsNaoIniciados = [];
    const leadsValidos: LeadNaoIniciado[] = [];
    const idsParaRemoverCRM: number[] = [];
    const idsParaRemoverTutts: number[] = [];

    for (const lead of leadsNaoIniciados) {
      const variacoes = gerarVariacoesTelefone(lead.telefone_normalizado);
      const existeNoCRM = variacoes.some(v => telefonesCRM.has(v));

      if (existeNoCRM) {
        // Lead já entrou no CRM - marcar para remoção
        idsParaRemoverCRM.push(lead.id);
      } else {
        // Adiciona à lista de válidos por enquanto
        leadsParaVerificarTutts.push(lead);
      }
    }

    // 4. Verificar na API Tutts apenas um LOTE (não todos!)
    if (verificarTutts && TUTTS_API_TOKEN && leadsParaVerificarTutts.length > 0) {
      const loteParaVerificar = leadsParaVerificarTutts.slice(0, limiteTutts);
      
      console.log(`[LeadsNaoIniciados] Verificando ${loteParaVerificar.length} leads na Tutts...`);

      for (const lead of loteParaVerificar) {
        const status = await verificarStatusProfissional(lead.telefone_normalizado);
        if (status === 'S') {
          // Profissional está ATIVO na Tutts - remover da lista
          idsParaRemoverTutts.push(lead.id);
          console.log(`[LeadsNaoIniciados] Lead ${lead.id} está ATIVO na Tutts`);
        }
      }
    }

    // 5. Montar lista final (excluindo os que serão removidos)
    const idsParaRemover = new Set([...idsParaRemoverCRM, ...idsParaRemoverTutts]);
    
    for (const lead of leadsNaoIniciados) {
      if (!idsParaRemover.has(lead.id)) {
        leadsValidos.push({
          id: lead.id,
          codigo: lead.codigo,
          nome: lead.nome,
          telefone: lead.telefone,
          telefone_normalizado: lead.telefone_normalizado,
          regiao: lead.regiao,
          whatsappLink: `https://wa.me/55${lead.telefone_normalizado}`,
          created_at: lead.created_at,
          data_cadastro: lead.data_cadastro || null,
        });
      }
    }

    // 6. Remover leads do banco
    if (idsParaRemoverCRM.length > 0) {
      console.log(`[LeadsNaoIniciados] Removendo ${idsParaRemoverCRM.length} leads que entraram no CRM`);
      await client.from('leads_nao_iniciados').delete().in('id', idsParaRemoverCRM);
    }

    if (idsParaRemoverTutts.length > 0) {
      console.log(`[LeadsNaoIniciados] Removendo ${idsParaRemoverTutts.length} leads ativos na Tutts`);
      await client.from('leads_nao_iniciados').delete().in('id', idsParaRemoverTutts);
    }

    // 7. Estatísticas
    const porRegiao: Record<string, number> = {};
    const regioesSet = new Set<string>();

    leadsValidos.forEach(l => {
      if (l.regiao) {
        porRegiao[l.regiao] = (porRegiao[l.regiao] || 0) + 1;
        regioesSet.add(l.regiao);
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        leads: leadsValidos,
        total: leadsValidos.length,
        removidos: idsParaRemoverCRM.length,
        removidosTutts: idsParaRemoverTutts.length,
        porRegiao,
        regioes: Array.from(regioesSet).sort(),
      },
    });

  } catch (error: any) {
    console.error('[LeadsNaoIniciados] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar leads', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remover lead específico ou limpar todos
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limparTodos = searchParams.get('limpar_todos') === 'true';

    if (limparTodos) {
      // Limpar todos os leads
      const { error } = await client
        .from('leads_nao_iniciados')
        .delete()
        .neq('id', 0); // Truque para deletar todos

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: 'Lista limpa com sucesso',
      });
    }

    if (id) {
      // Remover lead específico
      const { error } = await client
        .from('leads_nao_iniciados')
        .delete()
        .eq('id', parseInt(id));

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: 'Lead removido com sucesso',
      });
    }

    return NextResponse.json(
      { error: 'ID ou limpar_todos é obrigatório', success: false },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('[LeadsNaoIniciados] Erro ao deletar:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar', success: false, details: error.message },
      { status: 500 }
    );
  }
}
