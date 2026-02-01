-- ===========================================
-- SQL para criar tabela de Follow-ups
-- Execute no Supabase SQL Editor
-- ===========================================

-- Tabela de Follow-ups
CREATE TABLE IF NOT EXISTS followups (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES dados_cliente(id) ON DELETE CASCADE,
  
  -- Agendamento
  data_agendada DATE NOT NULL,
  motivo VARCHAR(100) NOT NULL,
  notas TEXT,
  
  -- Status: pendente, concluido, cancelado
  status VARCHAR(20) DEFAULT 'pendente',
  
  -- Tipo: manual (criado pelo usuário) ou automatico (criado pelo sistema)
  tipo VARCHAR(20) DEFAULT 'manual',
  
  -- Sequência (para follow-ups automáticos: 1, 2, etc)
  sequencia INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  -- Quem criou (null = sistema)
  criado_por INTEGER
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_data_agendada ON followups(data_agendada);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);

-- Adicionar coluna para rastrear se lead foi ressuscitado
ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS ressuscitado_em TIMESTAMP;

ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS vezes_ressuscitado INTEGER DEFAULT 0;

-- Comentários
COMMENT ON TABLE followups IS 'Tabela de follow-ups para acompanhamento de leads';
COMMENT ON COLUMN followups.tipo IS 'manual = criado pelo usuário, automatico = criado pelo sistema';
COMMENT ON COLUMN followups.sequencia IS 'Número do follow-up automático (1º, 2º, etc)';
COMMENT ON COLUMN dados_cliente.ressuscitado_em IS 'Data/hora da última ressurreição do lead morto';
COMMENT ON COLUMN dados_cliente.vezes_ressuscitado IS 'Quantas vezes o lead foi ressuscitado';
