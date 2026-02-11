'use client';

// ===========================================
// Página Leads Não Iniciados
// Upload de Excel, filtra quem NÃO está no CRM
// Região automática por DDD, WhatsApp clicável
// Remove automaticamente quando virar lead
// ===========================================

import { useState, useEffect, useRef } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Upload,
  Users,
  Loader2,
  AlertCircle,
  MapPin,
  Phone,
  Hash,
  User,
  Download,
  Filter,
  Search,
  MessageCircle,
  Trash2,
  FileSpreadsheet,
  CheckCircle,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import * as XLSX from 'xlsx';

interface LeadNaoIniciado {
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

interface ApiResponse {
  success: boolean;
  data: {
    leads: LeadNaoIniciado[];
    total: number;
    removidos: number;
    removidosTutts: number;
    porRegiao: Record<string, number>;
    regioes: string[];
  };
}

interface UploadResponse {
  success: boolean;
  data: {
    totalRecebidos: number;
    jaNoCRM: number;
    enriquecidos: number;
    novosInseridos: number;
    duplicados: number;
    totalNaLista: number;
    porRegiao: Record<string, number>;
  };
  message: string;
}

function LeadsNaoIniciadosContent() {
  const [leads, setLeads] = useState<LeadNaoIniciado[]>([]);
  const [leadsFiltrados, setLeadsFiltrados] = useState<LeadNaoIniciado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removidosUltimaVerificacao, setRemovidosUltimaVerificacao] = useState(0);
  
  // Filtros
  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  // Estatísticas
  const [stats, setStats] = useState({
    porRegiao: {} as Record<string, number>,
    regioes: [] as string[],
  });

  // Referência para o input de arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { fetchApi } = useApi();
  
  // Ref para controlar se já carregou inicialmente
  const hasLoaded = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar leads do banco (sem useCallback para evitar loops)
  const carregarLeads = async (showLoading = true, verificarTutts = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);

    const url = verificarTutts 
      ? '/api/leads-nao-iniciados?verificar_tutts=true'
      : '/api/leads-nao-iniciados';

    const { data: response, error: apiError } = await fetchApi<ApiResponse>(url);

    if (apiError) {
      setError(apiError);
    } else if (response?.success) {
      setLeads(response.data.leads);
      setStats({
        porRegiao: response.data.porRegiao,
        regioes: response.data.regioes,
      });

      // Notificar se leads foram removidos automaticamente
      const mensagens = [];
      if (response.data.removidos > 0) {
        mensagens.push(`${response.data.removidos} entraram no CRM`);
      }
      if (response.data.removidosTutts > 0) {
        mensagens.push(`${response.data.removidosTutts} ativos na Tutts`);
      }
      
      if (mensagens.length > 0) {
        setRemovidosUltimaVerificacao(response.data.removidos + response.data.removidosTutts);
        setSuccessMessage(`✅ Removidos: ${mensagens.join(' | ')}`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    }

    setIsLoading(false);
  };

  // Carregar ao montar (apenas uma vez) e configurar intervalo
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    
    // Carga inicial RÁPIDA (só CRM, sem Tutts)
    carregarLeads(true, false);
    
    // Configurar verificação automática a cada 2 minutos (CRM + lote de 10 Tutts)
    intervalRef.current = setInterval(() => {
      console.log('[LeadsNaoIniciados] Verificação automática (CRM + lote Tutts)...');
      carregarLeads(false, true);
    }, 120000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplicar filtros localmente
  useEffect(() => {
    let filtrados = [...leads];

    if (regiaoFiltro) {
      filtrados = filtrados.filter(l => l.regiao === regiaoFiltro);
    }

    if (busca) {
      const termoBusca = busca.toLowerCase();
      filtrados = filtrados.filter(l =>
        l.nome?.toLowerCase().includes(termoBusca) ||
        l.codigo?.toLowerCase().includes(termoBusca) ||
        l.telefone?.includes(termoBusca)
      );
    }

    // Filtro por data de cadastro
    if (dataInicio || dataFim) {
      filtrados = filtrados.filter(l => {
        if (!l.data_cadastro) return false;
        let dataISO = '';
        // Formato DD/MM/YYYY → YYYY-MM-DD
        if (l.data_cadastro.includes('/')) {
          const partes = l.data_cadastro.split('/');
          if (partes.length !== 3) return false;
          dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
        } 
        // Já está em YYYY-MM-DD
        else if (/^\d{4}-\d{2}-\d{2}/.test(l.data_cadastro)) {
          dataISO = l.data_cadastro.substring(0, 10);
        } else {
          return false;
        }
        if (dataInicio && dataISO < dataInicio) return false;
        if (dataFim && dataISO > dataFim) return false;
        return true;
      });
    }

    setLeadsFiltrados(filtrados);
  }, [leads, regiaoFiltro, busca, dataInicio, dataFim]);

  // Processar arquivo Excel
  const processarArquivo = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      // Encontrar índices das colunas
      const headers = jsonData[0] as string[];
      const headerLower = headers.map(h => (h || '').toString().toLowerCase().trim());
      
      let codigoIdx = headerLower.findIndex(h => h.includes('cod') || h.includes('código') || h.includes('codigo'));
      let nomeIdx = headerLower.findIndex(h => h.includes('nome') || h.includes('name'));
      let telefoneIdx = headerLower.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('celular') || h.includes('whatsapp'));
      let dataAtivacaoIdx = headerLower.findIndex(h => h.includes('data') && h.includes('ativa'));
      let dataCadastroIdx = headerLower.findIndex(h => h.includes('cadastro'));

      // Se não encontrou, tenta posição padrão
      if (codigoIdx === -1) codigoIdx = 0;
      if (nomeIdx === -1) nomeIdx = 1;
      if (telefoneIdx === -1) telefoneIdx = 2;
      // Coluna F = índice 5 (padrão para Data Ativação)
      if (dataAtivacaoIdx === -1) dataAtivacaoIdx = 5;
      // Data cadastro: se não encontrou, usa data ativação como fallback
      if (dataCadastroIdx === -1) dataCadastroIdx = dataAtivacaoIdx;

      console.log('[Upload] Colunas encontradas:', { codigoIdx, nomeIdx, telefoneIdx, dataAtivacaoIdx, dataCadastroIdx });

      // Extrair leads das linhas (pula header)
      const leadsExtraidos = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const telefone = row[telefoneIdx]?.toString().trim();
        if (!telefone) continue;

        // Extrair data de ativação (pode vir como número de série do Excel ou string)
        let dataAtivacao = '';
        const dataRaw = row[dataAtivacaoIdx];
        if (dataRaw) {
          if (typeof dataRaw === 'number') {
            // Número de série do Excel - converter para data
            const excelDate = new Date((dataRaw - 25569) * 86400 * 1000);
            const dia = String(excelDate.getDate()).padStart(2, '0');
            const mes = String(excelDate.getMonth() + 1).padStart(2, '0');
            const ano = excelDate.getFullYear();
            dataAtivacao = `${dia}/${mes}/${ano}`;
          } else {
            const raw = dataRaw.toString().trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
              const [ano, mes, dia] = raw.substring(0, 10).split('-');
              dataAtivacao = `${dia}/${mes}/${ano}`;
            } else {
              dataAtivacao = raw;
            }
          }
        }

        // Extrair data de cadastro
        let dataCadastro = '';
        const dataCadRaw = row[dataCadastroIdx];
        if (dataCadRaw) {
          if (typeof dataCadRaw === 'number') {
            const excelDate = new Date((dataCadRaw - 25569) * 86400 * 1000);
            const dia = String(excelDate.getDate()).padStart(2, '0');
            const mes = String(excelDate.getMonth() + 1).padStart(2, '0');
            const ano = excelDate.getFullYear();
            dataCadastro = `${dia}/${mes}/${ano}`;
          } else {
            const raw = dataCadRaw.toString().trim();
            // Se vier no formato ISO (YYYY-MM-DD), converter para DD/MM/YYYY
            if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
              const [ano, mes, dia] = raw.substring(0, 10).split('-');
              dataCadastro = `${dia}/${mes}/${ano}`;
            } else {
              dataCadastro = raw;
            }
          }
        }

        leadsExtraidos.push({
          codigo: row[codigoIdx]?.toString().trim() || '',
          nome: row[nomeIdx]?.toString().trim() || '',
          telefone,
          data_ativacao: dataAtivacao,
          data_cadastro: dataCadastro || dataAtivacao,
        });
      }

      console.log(`[Upload] ${leadsExtraidos.length} leads extraídos do Excel`);

      if (leadsExtraidos.length === 0) {
        throw new Error('Nenhum lead encontrado no arquivo. Verifique se há dados na planilha.');
      }

      // Enviar para API
      const { data: response, error: apiError } = await fetchApi<UploadResponse>(
        '/api/leads-nao-iniciados',
        {
          method: 'POST',
          body: JSON.stringify({ leads: leadsExtraidos }),
        }
      );

      if (apiError) throw new Error(apiError);

      if (response?.success) {
        const msg = [];
        if (response.data.novosInseridos > 0) {
          msg.push(`${response.data.novosInseridos} novos na lista`);
        }
        if (response.data.enriquecidos > 0) {
          msg.push(`${response.data.enriquecidos} leads enriquecidos no CRM`);
        }
        if (response.data.jaNoCRM > 0 && response.data.enriquecidos === 0) {
          msg.push(`${response.data.jaNoCRM} já no CRM`);
        }
        if (response.data.duplicados > 0) {
          msg.push(`${response.data.duplicados} duplicados ignorados`);
        }
        
        setSuccessMessage(`✅ ${msg.join(' | ')}`);

        // Recarregar lista
        await carregarLeads(false);
      }

    } catch (err: any) {
      console.error('[Upload] Erro:', err);
      setError(err.message || 'Erro ao processar arquivo');
    }

    setIsUploading(false);
  };

  // Handler do input de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processarArquivo(file);
    }
    // Limpar input para permitir reenvio do mesmo arquivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Limpar lista
  const limparLista = async () => {
    if (!confirm('Tem certeza que deseja limpar toda a lista de leads não iniciados?')) {
      return;
    }

    setIsClearing(true);
    setError(null);

    const { data: response, error: apiError } = await fetchApi<{ success: boolean }>(
      '/api/leads-nao-iniciados?limpar_todos=true',
      { method: 'DELETE' }
    );

    if (apiError) {
      setError(apiError);
    } else if (response?.success) {
      setLeads([]);
      setLeadsFiltrados([]);
      setStats({ porRegiao: {}, regioes: [] });
      setSuccessMessage('Lista limpa com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3000);
    }

    setIsClearing(false);
  };

  // Exportar para CSV
  const exportarCSV = () => {
    const headers = ['Código', 'Nome', 'Telefone', 'Região', 'WhatsApp'];
    const rows = leadsFiltrados.map(l => [
      l.codigo,
      l.nome,
      l.telefone,
      l.regiao,
      l.whatsappLink,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-nao-iniciados-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // Formatar telefone para exibição
  const formatarTelefone = (telefone: string): string => {
    const numeros = telefone.replace(/\D/g, '');
    if (numeros.length === 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    }
    if (numeros.length === 10) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }
    return telefone;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-orange-600" />
            Leads Não Iniciados
          </h1>
          <p className="text-gray-600">Leads que ainda não estão no CRM</p>
        </div>

        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <>
              <button
                onClick={exportarCSV}
                className="btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <button
                onClick={limparLista}
                disabled={isClearing}
                className="btn-secondary flex items-center gap-2 text-red-600 hover:bg-red-50"
              >
                {isClearing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Limpar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="card mb-4 p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Sucesso */}
      {successMessage && (
        <div className="card mb-4 p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Upload de Arquivo */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
          <span className="font-medium text-gray-700">Upload de Planilha</span>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer"
          >
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-gray-600">Processando arquivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-12 h-12 text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2">
                  Clique para selecionar ou arraste o arquivo Excel
                </p>
                <p className="text-sm text-gray-400">
                  Formatos aceitos: .xlsx, .xls, .csv
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Colunas esperadas: <strong>Código</strong>, <strong>Nome</strong>, <strong>Telefone</strong>
                </p>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Estatísticas */}
      {leads.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{leads.length}</p>
                  <p className="text-sm text-gray-500">Não Iniciados</p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">{stats.regioes.length}</p>
                  <p className="text-sm text-gray-500">Regiões</p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{removidosUltimaVerificacao}</p>
                  <p className="text-sm text-gray-500">Removidos (última verificação)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="card p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filtros:</span>
              </div>

              {/* Região */}
              <select
                value={regiaoFiltro}
                onChange={(e) => setRegiaoFiltro(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas regiões</option>
                {stats.regioes.map(r => (
                  <option key={r} value={r}>{r} ({stats.porRegiao[r] || 0})</option>
                ))}
              </select>

              {/* Busca */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Filtro por Data de Cadastro */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  title="Data cadastro - De"
                />
                <span className="text-xs text-gray-400">até</span>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  title="Data cadastro - Até"
                />
                {(dataInicio || dataFim) && (
                  <button
                    onClick={() => { setDataInicio(''); setDataFim(''); }}
                    className="text-xs text-red-500 hover:text-red-700"
                    title="Limpar filtro de data"
                  >
                    ✕
                  </button>
                )}
              </div>

              <span className="text-xs text-gray-400">
                Verifica CRM + 10 leads/Tutts a cada 2 min
              </span>
            </div>

            {/* Mini cards por região */}
            <div className="flex flex-wrap gap-2 mt-4">
              {Object.entries(stats.porRegiao)
                .sort((a, b) => b[1] - a[1])
                .map(([regiao, qtd]) => (
                  <span
                    key={regiao}
                    onClick={() => setRegiaoFiltro(regiaoFiltro === regiao ? '' : regiao)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
                      regiaoFiltro === regiao
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    )}
                  >
                    {regiao}: <strong>{qtd}</strong>
                  </span>
                ))}
            </div>
          </div>

          {/* Tabela */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        Código
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Nome
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Telefone
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Região
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Data Cadastro
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        WhatsApp
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leadsFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>Nenhum lead encontrado</p>
                      </td>
                    </tr>
                  ) : (
                    leadsFiltrados.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {lead.codigo || '---'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">
                            {lead.nome || 'Sem nome'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a
                            href={lead.whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-4 h-4" />
                            {formatarTelefone(lead.telefone)}
                          </a>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                            {lead.regiao}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-gray-600">
                            {lead.data_cadastro || '---'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a
                            href={lead.whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Abrir
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {leadsFiltrados.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
                Mostrando {leadsFiltrados.length} de {leads.length} leads não iniciados
              </div>
            )}
          </div>
        </>
      )}

      {/* Estado vazio */}
      {leads.length === 0 && !isLoading && (
        <div className="card p-12 text-center">
          <Upload className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            Nenhum lead na lista
          </h3>
          <p className="text-gray-500 mb-4">
            Faça upload de uma planilha Excel com os leads para verificar quais ainda não estão no CRM
          </p>
          <label
            htmlFor="file-upload"
            className="btn-primary inline-flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Selecionar Arquivo
          </label>
        </div>
      )}
    </div>
  );
}

export default function LeadsNaoIniciadosPage() {
  return (
    <AuthLayout>
      <LeadsNaoIniciadosContent />
    </AuthLayout>
  );
}
