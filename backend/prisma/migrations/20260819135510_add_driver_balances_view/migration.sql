-- Saldo do motorista: uma definição, um sítio.
--
-- A fórmula esteve replicada em quatro lugares — uma vez em Prisma, no
-- balance.service, e três vezes em SQL cru no analytics.repository. Uma
-- correção chegou a ser aplicada a uma cópia e esquecida noutra, e o painel
-- divergiu das contas individuais até alguém reparar.
--
-- Views não vivem no schema.prisma; são criadas por migração e consultadas com
-- $queryRaw. É por isso que esta migração existe à parte: apagar as migrações
-- e regenerar a partir do schema não a traz de volta.

CREATE OR REPLACE VIEW driver_balances AS
SELECT
  u.id                                  AS user_id,
  u.name                                AS user_name,
  u.email                               AS user_email,
  u.status                              AS user_status,

  -- Fechos semanais registados. A ÚNICA origem de dinheiro na conta: os
  -- lançamentos que o motorista comunica não creditam nada, servem de
  -- conferência a quem fecha a semana.
  COALESCE(s.total, 0)                  AS settlements,

  COALESCE(c.total, 0)                  AS credits,
  COALESCE(d.total, 0)                  AS debits,

  -- Já saiu da conta.
  COALESCE(w.total, 0)                  AS withdrawn,

  -- Reservado: um pedido pendente não pode ser gasto duas vezes.
  COALESCE(p.total, 0)                  AS pending_withdrawals,

  -- Informativo, FORA do cálculo: o que o motorista comunicou.
  COALESCE(e.total, 0)                  AS reported_earnings,

  -- Pode ser negativo, e isso é deliberado: um motorista cujas despesas
  -- superem os ganhos fica a dever, e o valor é descontado dos fechos
  -- seguintes.
  COALESCE(s.total, 0) + COALESCE(c.total, 0) - COALESCE(d.total, 0)
    - COALESCE(w.total, 0) - COALESCE(p.total, 0)
                                        AS available

FROM users u

LEFT JOIN (
  SELECT user_id, SUM(net_to_driver) AS total
  FROM weekly_settlements
  WHERE status = 'REGISTERED'
  GROUP BY user_id
) s ON s.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM balance_adjustments
  WHERE type = 'CREDIT'
  GROUP BY user_id
) c ON c.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM balance_adjustments
  WHERE type = 'DEBIT'
  GROUP BY user_id
) d ON d.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM withdrawals
  WHERE status IN ('APPROVED', 'PAID')
  GROUP BY user_id
) w ON w.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM withdrawals
  WHERE status = 'PENDING'
  GROUP BY user_id
) p ON p.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM earnings
  GROUP BY user_id
) e ON e.user_id = u.id

-- Inclui todos os utilizadores, não apenas DRIVER: quem consulta filtra pelo
-- que precisa. Restringir aqui obrigaria a uma segunda view no dia em que um
-- gestor tivesse saldo.
;