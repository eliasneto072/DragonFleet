-- Acrescenta o papel INVESTOR.
--
-- Fica sozinho nesta migração de propósito. O Postgres não deixa usar um valor
-- de enum na mesma transação em que ele é criado, e a migração seguinte —
-- as tabelas e a view do portal — precisa de o referir. Separadas, cada uma
-- corre na sua transação e o valor já existe quando a segunda arranca.
--
-- IF NOT EXISTS para um deploy repetido não rebentar.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INVESTOR';
