// ===========================================
// API: /api/enriquecer
// POST: Enriquece leads com dados da planilha Google Sheets
// - Busca planilha CSV
// - Cruza por telefone
// - Atualiza: regiao, nomewpp, cod_profissional, tags (TP)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// URL da planilha principal (profissionais)
const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';

// URL da planilha de Tráfego Pago
const PLANILHA_TP_URL = 'https://docs.google.com/spreadsheets/d/1fC1i_qTiUmX77-Y5iRjGIJRzMSifPUSeULe_Thh1rZU/export?format=csv&gid=0';

// Normaliza telefone para comparação (remove tudo exceto números)
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
    // Adiciona o 9 após o DDD
    numeros = numeros.substring(0, 2) + '9' + numeros.substring(2);
  }
  
  return numeros;
}

// Gera variações do telefone para busca
function gerarVariacoesTelefone(telefone: string): string[] {
  const normalizado = normalizarTelefone(telefone);
  if (!normalizado) return [];
  
  const variacoes: string[] = [normalizado];
  
  // Com código do país
  variacoes.push('55' + normalizado);
  
  // Sem o 9 (telefone antigo)
  if (normalizado.length === 11) {
    const sem9 = normalizado.substring(0, 2) + normalizado.substring(3);
    variacoes.push(sem9);
    variacoes.push('55' + sem9);
  }
  
  return variacoes;
}

// Parseia CSV para array de objetos
function parseCSV(csvText: string): Record<string, string>[] {
  // Remove BOM se existir
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  
  // Primeira linha é o header - limpa bem os nomes
  const headers = linhas[0].split(',').map(h => 
    h.trim()
      .replace(/"/g, '')
      .replace(/^\uFEFF/, '') // Remove BOM de cada campo também
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .toLowerCase()
  );
  
  console.log('[Enriquecer] Headers encontrados:', headers);
  
  const dados: Record<string, string>[] = [];
  
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    
    // Parse simples de CSV
    const valores = linha.split(',').map(v => v.trim().replace(/"/g, ''));
    
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = valores[index] || '';
    });
    
    dados.push(obj);
  }
  
  return dados;
}

// Função para converter data BR (DD/MM/YYYY) para ISO (YYYY-MM-DD)
function parseDataBR(dataStr: string): string | null {
  if (!dataStr || dataStr.trim() === '') return null;
  
  // Tentar diferentes formatos
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

// Interface para dados da planilha
interface DadosPlanilha {
  codigo: string;
  nome: string;
  telefone: string;
  telefoneNormalizado: string;
  cidade: string;
  dataAtivacao: string | null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    
    const resultados = {
      totalPlanilha: 0,
      totalLeads: 0,
      atualizados: 0,
      naoEncontrados: 0,
      erros: [] as string[],
      detalhes: [] as { lead_id: number; telefone: string; nome: string; regiao: string; cod: string }[],
    };

    // ============================================
    // 1. BUSCAR PLANILHA CSV
    // ============================================
    console.log('[Enriquecer] Buscando planilha CSV...');
    
    const response = await fetch(PLANILHA_CSV_URL, {
      headers: {
        'Accept': 'text/csv',
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar planilha: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const dadosPlanilha = parseCSV(csvText);
    
    console.log(`[Enriquecer] Planilha carregada: ${dadosPlanilha.length} registros`);
    
    // Log do primeiro registro para debug
    if (dadosPlanilha.length > 0) {
      console.log('[Enriquecer] Primeiro registro da planilha:', dadosPlanilha[0]);
    }
    
    resultados.totalPlanilha = dadosPlanilha.length;

    // ============================================
    // 2. CRIAR MAPA DE TELEFONES DA PLANILHA
    // ============================================
    // Estrutura: { telefoneNormalizado: dadosPlanilha }
    const mapaPlanilha = new Map<string, DadosPlanilha>();
    
    dadosPlanilha.forEach(row => {
      // Headers da planilha (podem ter acento)
      // Coluna A = Código, B = Nome, C = Telefone, D = Cidade, F = Data Ativação
      const codigo = row['Código'] || row['Codigo'] || row['codigo'] || row['cod'] || '';
      const nome = row['Nome'] || row['nome'] || row['name'] || '';
      const telefone = row['Telefone'] || row['telefone'] || row['phone'] || row['tel'] || '';
      const cidade = row['Cidade'] || row['cidade'] || row['city'] || row['regiao'] || '';
      const dataAtivacaoRaw = row['Data Ativação'] || row['Data Ativacao'] || row['data ativacao'] || row['data_ativacao'] || '';
      
      // Converter data BR para ISO
      const dataAtivacao = parseDataBR(dataAtivacaoRaw);
      
      if (telefone) {
        const telNormalizado = normalizarTelefone(telefone);
        if (telNormalizado) {
          mapaPlanilha.set(telNormalizado, {
            codigo,
            nome,
            telefone,
            telefoneNormalizado: telNormalizado,
            cidade: cidade.toUpperCase(),
            dataAtivacao,
          });
        }
      }
    });
    
    console.log(`[Enriquecer] Mapa criado: ${mapaPlanilha.size} telefones únicos`);

    // ============================================
    // 2.1 BUSCAR PLANILHA DE TRÁFEGO PAGO
    // ============================================
    console.log('[Enriquecer] Buscando planilha de Tráfego Pago...');
    
    const mapaTP = new Map<string, string>(); // telefone -> tag TP
    
    try {
      const responseTP = await fetch(PLANILHA_TP_URL, {
        headers: { 'Accept': 'text/csv' },
      });

      if (responseTP.ok) {
        const csvTextTP = await responseTP.text();
        const dadosTP = parseCSV(csvTextTP);
        
        console.log(`[Enriquecer] Planilha TP carregada: ${dadosTP.length} registros`);
        
        // Log do primeiro registro para debug
        if (dadosTP.length > 0) {
          console.log('[Enriquecer] Primeiro registro TP:', dadosTP[0]);
        }
        
        dadosTP.forEach(row => {
          // Coluna B = Phone, Coluna D = TP
          const telefone = row['Phone'] || row['phone'] || row['Telefone'] || row['telefone'] || '';
          const tp = row['TP'] || row['tp'] || row['Tp'] || '';
          
          if (telefone && tp) {
            const telNormalizado = normalizarTelefone(telefone);
            if (telNormalizado) {
              mapaTP.set(telNormalizado, tp.trim());
            }
          }
        });
        
        console.log(`[Enriquecer] Mapa TP criado: ${mapaTP.size} telefones com tag`);
      } else {
        console.log('[Enriquecer] Erro ao buscar planilha TP:', responseTP.status);
      }
    } catch (tpError) {
      console.log('[Enriquecer] Erro ao processar planilha TP:', tpError);
    }

    // ============================================
    // 3. BUSCAR TODOS OS LEADS DO CRM
    // ============================================
    const { data: leads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('id, telefone, nomewpp, regiao, cod_profissional, tags')
      .eq('status', 'ativo');

    if (errorLeads) throw errorLeads;

    resultados.totalLeads = leads?.length || 0;
    console.log(`[Enriquecer] Leads no CRM: ${resultados.totalLeads}`);

    // ============================================
    // 4. CRUZAR E ATUALIZAR
    // ============================================
    for (const lead of leads || []) {
      if (!lead.telefone) continue;

      try {
        // Gerar variações do telefone do lead
        const variacoes = gerarVariacoesTelefone(lead.telefone);
        
        // Buscar na planilha principal
        let dadosEncontrados: DadosPlanilha | null = null;
        
        for (const variacao of variacoes) {
          if (mapaPlanilha.has(variacao)) {
            dadosEncontrados = mapaPlanilha.get(variacao)!;
            break;
          }
        }

        // Buscar na planilha de TP (match EXATO, sem variações com/sem 9)
        let tagTP: string | null = null;
        const telNorm = normalizarTelefone(lead.telefone);
        if (mapaTP.has(telNorm)) {
          tagTP = mapaTP.get(telNorm)!;
        } else if (mapaTP.has('55' + telNorm)) {
          tagTP = mapaTP.get('55' + telNorm)!;
        }

        // Preparar update
        const updateData: any = {};
        
        if (dadosEncontrados) {
          // SEMPRE atualizar região se encontrou cidade
          if (dadosEncontrados.cidade) {
            updateData.regiao = dadosEncontrados.cidade;
          }
          
          // SEMPRE atualizar nome se encontrou na planilha
          if (dadosEncontrados.nome) {
            updateData.nomewpp = dadosEncontrados.nome;
          }
          
          // SEMPRE atualizar código do profissional
          if (dadosEncontrados.codigo) {
            updateData.cod_profissional = dadosEncontrados.codigo;
          }
          
          // SEMPRE atualizar data de ativação se encontrou na planilha
          if (dadosEncontrados.dataAtivacao) {
            updateData.data_ativacao = dadosEncontrados.dataAtivacao;
          }
          
          // Log para debug
          console.log(`[Enriquecer] Lead ${lead.id} - Dados encontrados:`, {
            nome: dadosEncontrados.nome,
            cidade: dadosEncontrados.cidade,
            codigo: dadosEncontrados.codigo,
            dataAtivacao: dadosEncontrados.dataAtivacao,
          });
        }
        
        // Adicionar tag do Tráfego Pago se encontrou
        if (tagTP) {
          // Pegar tags atuais do lead
          const tagsAtuais: string[] = Array.isArray(lead.tags) ? lead.tags : [];
          
          // Adicionar tag TP se ainda não existe
          if (!tagsAtuais.includes(tagTP)) {
            updateData.tags = [...tagsAtuais, tagTP];
            console.log(`[Enriquecer] Lead ${lead.id} - Tag TP adicionada: ${tagTP}`);
          }
        }
        
        // Só atualiza se tiver algo para atualizar
        if (Object.keys(updateData).length > 0) {
          updateData.updated_at = new Date().toISOString();
          
          const { error: updateError } = await client
            .from('dados_cliente')
            .update(updateData)
            .eq('id', lead.id);

          if (updateError) {
            resultados.erros.push(`Lead ${lead.id}: ${updateError.message}`);
            console.log(`[Enriquecer] ERRO Lead ${lead.id}:`, updateError.message);
          } else {
            resultados.atualizados++;
            resultados.detalhes.push({
              lead_id: lead.id,
              telefone: lead.telefone,
              nome: dadosEncontrados?.nome || '',
              regiao: dadosEncontrados?.cidade || '',
              cod: dadosEncontrados?.codigo || '',
            });
            console.log(`[Enriquecer] Lead ${lead.id} atualizado`);
          }
        } else {
          resultados.naoEncontrados++;
        }
      } catch (leadError: any) {
        resultados.erros.push(`Lead ${lead.id}: ${leadError.message}`);
      }
    }

    console.log(`[Enriquecer] Concluído:`, {
      atualizados: resultados.atualizados,
      naoEncontrados: resultados.naoEncontrados,
      erros: resultados.erros.length,
    });

    return NextResponse.json({
      success: true,
      data: resultados,
      message: `Enriquecimento concluído: ${resultados.atualizados} leads atualizados de ${resultados.totalLeads} total`,
    });

  } catch (error: any) {
    console.error('[Enriquecer] Erro:', error);
    return NextResponse.json(
      { error: 'Erro no enriquecimento', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// GET para verificar status/preview
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    // Buscar preview da planilha
    const response = await fetch(PLANILHA_CSV_URL);
    if (!response.ok) {
      throw new Error(`Erro ao buscar planilha: ${response.status}`);
    }

    const csvText = await response.text();
    const dados = parseCSV(csvText);

    return NextResponse.json({
      success: true,
      data: {
        totalRegistros: dados.length,
        preview: dados.slice(0, 5), // Primeiros 5 registros
        colunas: dados.length > 0 ? Object.keys(dados[0]) : [],
      },
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao verificar planilha', success: false, details: error.message },
      { status: 500 }
    );
  }
}
