// src/app/components/driver/profile.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { User, Mail, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';

export function DriverProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');

  // ── Leitura — busca os dados mais recentes do perfil ─────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.users.detail(user!.id),
    queryFn:  () => usersService.getById(user!.id),
    // Inicializa os campos de edição quando os dados chegam
    select: (res) => {
      setName(res.user.name);
      setEmail(res.user.email);
      return res.user;
    },
  });

  // ── Atualização ───────────────────────────────────────────────────────────
  const { mutate: updateUser, isPending } = useMutation({
    mutationFn: () => usersService.update(user!.id, { name, email }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(queryKeys.users.detail(user!.id), { user: updated });
      toast.success('Perfil atualizado com sucesso!');
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar perfil.');
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateUser();
  }

  // ── Estados ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando perfil…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar perfil.</p>
        <Button variant="outline" onClick={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(user!.id) })
        }>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center shrink-0">
              <User className="h-12 w-12 text-[#1D1D1D]" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{data.name}</h2>
              <p className="text-gray-200">{data.email}</p>
              <div className="flex gap-3 mt-2">
                <span className="px-3 py-1 bg-white/20 text-white rounded-full text-sm capitalize">
                  {data.role === 'DRIVER' ? 'Motorista' : data.role === 'ADMIN' ? 'Admin' : 'Manager'}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  data.status === 'ACTIVE'
                    ? 'bg-green-400/30 text-green-100'
                    : 'bg-red-400/30 text-red-100'
                }`}>
                  {data.status === 'ACTIVE' ? 'Ativo' : data.status === 'INACTIVE' ? 'Inativo' : 'Bloqueado'}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              className="bg-white text-[#1D1D1D] hover:bg-gray-100 shrink-0"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancelar' : 'Editar Perfil'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  value={name}
                  disabled={!isEditing}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled={!isEditing}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Membro desde</Label>
                <Input
                  value={new Date(data.createdAt).toLocaleDateString('pt-BR')}
                  disabled
                />
              </div>
              <div className="space-y-1">
                <Label>Última atualização</Label>
                <Input
                  value={new Date(data.updatedAt).toLocaleDateString('pt-BR')}
                  disabled
                />
              </div>
            </div>

            {isEditing && (
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setName(data.name);
                    setEmail(data.email);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar Alterações
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Segurança */}
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Para alterar sua senha, entre em contato com o suporte ou use a opção de recuperação de senha.
          </p>
          <Button variant="outline">Alterar Senha</Button>
        </CardContent>
      </Card>
    </div>
  );
}