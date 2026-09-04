-- Acrescenta o papel SUPPORT.
--
-- ALTER TYPE ... ADD VALUE é aditivo: não toca em nenhuma linha existente e não
-- pode falhar por dados. Nenhum utilizador nasce SUPPORT — o papel é atribuído
-- na tela de Equipa, por um administrador, a uma conta que já existe.
--
-- IF NOT EXISTS para a migração poder correr duas vezes sem rebentar, o que
-- acontece se um deploy for repetido.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPORT';
