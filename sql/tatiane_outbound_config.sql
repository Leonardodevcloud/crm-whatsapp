-- ===========================================
-- Config do contato automatico da Tatiane (primeiro contato por data de chegada)
-- Singleton (id=1). Editavel pela tela /config-contato do CRM.
-- Rode no SQL Editor do Supabase (mesmo banco do dados_cliente).
-- ===========================================
CREATE TABLE IF NOT EXISTS tatiane_outbound_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT false,
  leads_por_dia INTEGER NOT NULL DEFAULT 20,
  dias_apos_chegada INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INTEGER,
  CONSTRAINT tatiane_outbound_config_singleton CHECK (id = 1)
);

INSERT INTO tatiane_outbound_config (id, ativo, leads_por_dia, dias_apos_chegada)
VALUES (1, false, 20, 2)
ON CONFLICT (id) DO NOTHING;
