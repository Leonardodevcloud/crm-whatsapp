// ===========================================
// API: /api/profissionais
// GET: Lista profissionais da planilha Google Sheets
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

// URL da planilha exportada como CSV
const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';

// Parseia CSV para array de objetos
function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  
  // Primeira linha é o header
  const headers = linhas[0].split(',').map(h => 
    h.trim().replace(/"/g, '').replace(/^\uFEFF/, '')
  );
  
  console.log('[Profissionais] Headers encontrados:', headers);
  
  const dados: Record<string, string>[] = [];
  
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    
    const valores = linha.split(',').map(v => v.trim().replace(/"/g, ''));
    
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = valores[index] || '';
    });
    
    dados.push(obj);
  }
  
  return dados;
}

interface Profissional {
  codigo: string;
  nome: string;
  telefone: string;
  regiao: string;
  dataAtivacao: string;
  quemAtivou: string;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    // Buscar planilha
    console.log('[Profissionais] Buscando planilha...');
    const response = await fetch(PLANILHA_CSV_URL, {
      headers: { 'Accept': 'text/csv' },
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar planilha: ${response.status}`);
    }

    const csvText = await response.text();
    const dadosPlanilha = parseCSV(csvText);
    
    console.log(`[Profissionais] Planilha carregada: ${dadosPlanilha.length} registros`);

    // Mapear dados
    const profissionais: Profissional[] = [];
    const regioesSet = new Set<string>();
    const ativadoresSet = new Set<string>();

    for (const row of dadosPlanilha) {
      // Mapear colunas (flexível para diferentes nomes)
      const codigo = row['Código'] || row['Codigo'] || row['codigo'] || '';
      const nome = row['Nome'] || row['nome'] || '';
      const telefone = row['Telefone'] || row['telefone'] || '';
      const cidade = row['Cidade'] || row['cidade'] || '';
      const dataAtivacao = row['Data Ativação'] || row['Data Ativacao'] || row['data ativação'] || row['data ativacao'] || '';
      const quemAtivou = row['Quem Ativou'] || row['quem ativou'] || '';

      // Coletar regiões e ativadores únicos
      if (cidade) regioesSet.add(cidade.toUpperCase());
      if (quemAtivou) ativadoresSet.add(quemAtivou);

      profissionais.push({
        codigo,
        nome,
        telefone,
        regiao: cidade.toUpperCase(),
        dataAtivacao,
        quemAtivou,
      });
    }

    // Estatísticas
    const estatisticas = {
      total: profissionais.length,
      porRegiao: {} as Record<string, number>,
      porAtivador: {} as Record<string, number>,
    };

    profissionais.forEach(p => {
      if (p.regiao) {
        estatisticas.porRegiao[p.regiao] = (estatisticas.porRegiao[p.regiao] || 0) + 1;
      }
      if (p.quemAtivou) {
        estatisticas.porAtivador[p.quemAtivou] = (estatisticas.porAtivador[p.quemAtivou] || 0) + 1;
      }
    });

    return NextResponse.json({
      success: true,
      data: profissionais,
      estatisticas,
      regioes: Array.from(regioesSet).sort(),
      ativadores: Array.from(ativadoresSet).sort(),
    });

  } catch (error: any) {
    console.error('[Profissionais] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar profissionais', success: false, details: error.message },
      { status: 500 }
    );
  }
}
