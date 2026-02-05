-- ===========================================
-- Adicionar campo resumo_ia na tabela dados_cliente
-- ===========================================

-- Adicionar coluna para armazenar o resumo gerado pela IA
ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS resumo_ia TEXT;

-- Comentário para documentação
COMMENT ON COLUMN dados_cliente.resumo_ia IS 'Resumo do atendimento gerado automaticamente pela IA quando o lead é qualificado';

-- ===========================================
-- Adicionar campo data_ativacao na tabela dados_cliente
-- ===========================================

-- Adicionar coluna para armazenar a data de ativação do profissional (vem da planilha)
ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS data_ativacao DATE;

-- Comentário para documentação
COMMENT ON COLUMN dados_cliente.data_ativacao IS 'Data em que o profissional foi ativado na Tutts (importado da planilha). Se data_ativacao < created_at, significa que já era ativo antes de falar, então não é lead real.';

-- Índice para filtros
CREATE INDEX IF NOT EXISTS idx_dados_cliente_data_ativacao ON dados_cliente(data_ativacao);
