// ===========================================
// API: /api/enriquecer
// POST: Enriquece leads com dados da planilha Google Sheets
// - Busca planilha CSV
// - Cruza por telefone
// - Atualiza: regiao, nomewpp, cod_profissional
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// URL da planilha exportada como CSV
const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';

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

// Interface para dados da planilha
interface DadosPlanilha {
  codigo: string;
  nome: string;
  telefone: string;
  telefoneNormalizado: string;
  cidade: string;
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
      // Coluna A = Código, B = Nome, C = Telefone, D = Cidade
      const codigo = row['Código'] || row['Codigo'] || row['codigo'] || row['cod'] || '';
      const nome = row['Nome'] || row['nome'] || row['name'] || '';
      const telefone = row['Telefone'] || row['telefone'] || row['phone'] || row['tel'] || '';
      const cidade = row['Cidade'] || row['cidade'] || row['city'] || row['regiao'] || '';
      
      if (telefone) {
        const telNormalizado = normalizarTelefone(telefone);
        if (telNormalizado) {
          mapaPlanilha.set(telNormalizado, {
            codigo,
            nome,
            telefone,
            telefoneNormalizado: telNormalizado,
            cidade: cidade.toUpperCase(),
          });
        }
      }
    });
    
    console.log(`[Enriquecer] Mapa criado: ${mapaPlanilha.size} telefones únicos`);

    // ============================================
    // 3. BUSCAR TODOS OS LEADS DO CRM
    // ============================================
    const { data: leads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('id, telefone, nomewpp, regiao, cod_profissional')
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
        
        // Buscar na planilha
        let dadosEncontrados: DadosPlanilha | null = null;
        
        for (const variacao of variacoes) {
          if (mapaPlanilha.has(variacao)) {
            dadosEncontrados = mapaPlanilha.get(variacao)!;
            break;
          }
        }

        if (dadosEncontrados) {
          // Preparar update
          const updateData: any = {};
          
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
          
          // Log para debug
          console.log(`[Enriquecer] Lead ${lead.id} - Dados encontrados:`, {
            nome: dadosEncontrados.nome,
            cidade: dadosEncontrados.cidade,
            codigo: dadosEncontrados.codigo,
          });
          
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
                nome: dadosEncontrados.nome,
                regiao: dadosEncontrados.cidade,
                cod: dadosEncontrados.codigo,
              });
              console.log(`[Enriquecer] Lead ${lead.id} atualizado: ${dadosEncontrados.nome} - ${dadosEncontrados.cidade} - COD: ${dadosEncontrados.codigo}`);
            }
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
