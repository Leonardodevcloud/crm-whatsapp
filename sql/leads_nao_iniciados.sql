-- ===========================================
-- Tabela: leads_nao_iniciados
-- Armazena leads de planilhas que ainda não
-- iniciaram conversa no CRM
-- ===========================================

CREATE TABLE IF NOT EXISTS leads_nao_iniciados (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50),
  nome VARCHAR(255),
  telefone VARCHAR(20) NOT NULL,
  telefone_normalizado VARCHAR(20) NOT NULL,
  regiao VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by INTEGER REFERENCES usuarios(id),
  
  -- Telefone normalizado deve ser único
  UNIQUE(telefone_normalizado)
);

-- Índice para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_leads_nao_iniciados_telefone 
ON leads_nao_iniciados(telefone_normalizado);

-- Comentários
COMMENT ON TABLE leads_nao_iniciados IS 'Leads de planilhas que ainda não iniciaram conversa no WhatsApp';
COMMENT ON COLUMN leads_nao_iniciados.telefone_normalizado IS 'Telefone sem formatação para comparação';
COMMENT ON COLUMN leads_nao_iniciados.regiao IS 'Região derivada do DDD do telefone';
