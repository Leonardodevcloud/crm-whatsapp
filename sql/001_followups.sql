-- ===========================================
-- SQL: Tabela de Follow-ups
-- Execute este script no Supabase SQL Editor
-- ===========================================

-- 1. Criar tabela de follow-ups
CREATE TABLE IF NOT EXISTS followups (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES dados_cliente(id) ON DELETE CASCADE,
  data_agendada DATE NOT NULL,
  motivo VARCHAR(100) NOT NULL,
  notas TEXT,
  tipo VARCHAR(20) DEFAULT 'manual', -- 'manual' ou 'automatico'
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'concluido', 'cancelado'
  sequencia INTEGER DEFAULT 1, -- 1º, 2º follow-up
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by INTEGER -- ID do usuário que criou (null se automático)
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_data_agendada ON followups(data_agendada);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);

-- 3. Adicionar coluna 'ressuscitado' na tabela de leads (para tracking)
ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS ressuscitado_em TIMESTAMP WITH TIME ZONE;

ALTER TABLE dados_cliente 
ADD COLUMN IF NOT EXISTS vezes_ressuscitado INTEGER DEFAULT 0;

-- 4. Criar view para follow-ups com dados do lead
CREATE OR REPLACE VIEW followups_completos AS
SELECT 
  f.*,
  d.nomewpp,
  d.telefone,
  d.stage,
  d.regiao,
  d.iniciado_por,
  CASE 
    WHEN f.data_agendada < CURRENT_DATE AND f.status = 'pendente' THEN 'atrasado'
    WHEN f.data_agendada = CURRENT_DATE AND f.status = 'pendente' THEN 'hoje'
    WHEN f.data_agendada > CURRENT_DATE AND f.status = 'pendente' THEN 'futuro'
    ELSE f.status
  END as situacao
FROM followups f
JOIN dados_cliente d ON f.lead_id = d.id;

-- 5. Função para contar follow-ups pendentes
CREATE OR REPLACE FUNCTION contar_followups_pendentes()
RETURNS TABLE (
  atrasados BIGINT,
  hoje BIGINT,
  proximos BIGINT,
  total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE data_agendada < CURRENT_DATE AND status = 'pendente') as atrasados,
    COUNT(*) FILTER (WHERE data_agendada = CURRENT_DATE AND status = 'pendente') as hoje,
    COUNT(*) FILTER (WHERE data_agendada > CURRENT_DATE AND status = 'pendente') as proximos,
    COUNT(*) FILTER (WHERE status = 'pendente') as total
  FROM followups;
END;
$$ LANGUAGE plpgsql;

-- 6. Habilitar RLS (Row Level Security)
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;

-- 7. Política de acesso (permite tudo para usuários autenticados)
CREATE POLICY "Acesso total para autenticados" ON followups
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===========================================
-- Pronto! Agora a tabela está criada.
-- ===========================================
