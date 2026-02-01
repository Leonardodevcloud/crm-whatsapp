-- ===========================================
-- SQL para adicionar campo cod_profissional
-- Execute no Supabase SQL Editor
-- ===========================================

-- Adicionar campo cod_profissional na tabela de leads
ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS cod_profissional VARCHAR(20);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_dados_cliente_cod_profissional 
ON dados_cliente(cod_profissional);

-- Comentário
COMMENT ON COLUMN dados_cliente.cod_profissional IS 'Código do profissional na planilha de ativados';
