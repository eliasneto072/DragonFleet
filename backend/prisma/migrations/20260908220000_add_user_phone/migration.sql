-- Contacto telefónico do motorista.
--
-- NULL e sem restrição de unicidade, pelas razões que estão no schema.prisma.
-- Nenhum registo existente é tocado: quem já lá está fica com NULL, que é a
-- representação honesta de "não sabemos o telefone desta pessoa".
--
-- Sem índice. A pergunta que se faz a esta coluna é "qual é o telefone do
-- motorista X", que já chega pela chave primária. Ninguém procura um motorista
-- PELO telefone — e se um dia for preciso, acrescenta-se então.

ALTER TABLE "users" ADD COLUMN "phone" TEXT;
