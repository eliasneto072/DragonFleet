// src/app/components/driver/profile.tsx
//
// Perfil do motorista.
//
// FOTOGRAFIA: vem do documento FOTO_PERFIL, que já é um dos cinco exigidos —
// não faz sentido pedir a mesma imagem duas vezes. É mostrada assim que
// enviada, mesmo em análise, com um aviso de que ainda não foi aprovada. A
// substituição acontece em Documentos, para existir um único caminho de envio.
// O object URL é libertado ao desmontar; sem isso cada visita à tela retinha
// um blob em memória.
//
// ESTADO DA CONTA: UserStatus tem quatro valores. A versão anterior usava um
// ternário de três ramos e mostrava "Bloqueado" para AGUARDANDO_REGULARIZACAO
// — o estado que o job de expiração aplica quando o Registo Criminal vence.
// Uma mensagem bem mais grave do que a realidade, e em contradição com a tela
// de Documentos, que diria apenas que falta um documento.
//
// SEGURANÇA: alterar a palavra-passe ou o email exige confirmar a palavra-passe
// atual. Ter o token não deve bastar para tomar a conta: ele vive no
// localStorage, e o email é o canal de recuperação — quem trocar os dois deixa
// o dono sem caminho de volta. Ver users.service.assertCurrentPassword.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertCircle, CalendarDays, Camera, Loader2, Lock, Mail, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { BankAccountSection } from '@/app/components/driver/bank-account';
import { usersService } from '@/features/admin/services/users.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiUser, UserStatus } from '@/shared/types/api';

const ROLE_LABELS: Record<string, string> = {
  DRIVER: 'Motorista',
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
};

// Os quatro estados possíveis, com variantes dark: explícitas — as escalas do
// Tailwind não invertem sozinhas.
const STATUS_META: Record<UserStatus, { label: string; cls: string }> = {
  ACTIVE: {
    label: 'Ativo',
    cls: 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  AGUARDANDO_REGULARIZACAO: {
    label: 'Aguarda regularização',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  INACTIVE: {
    label: 'Inativo',
    cls: 'bg-secondary text-muted-foreground',
  },
  BLOCKED: {
    label: 'Bloqueado',
    cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function ProfileAvatar({ name, photoUrl, pending }: {
  name: string;
  photoUrl: string | null;
  pending: boolean;
}) {
  return (
    <div className="relative shrink-0">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`Fotografia de ${name}`}
          className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"
        />
      ) : (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-emerald-950 dark:text-emerald-300 sm:h-20 sm:w-20 sm:text-xl"
          aria-hidden="true"
        >
          {initials(name) || <User className="h-7 w-7" />}
        </div>
      )}

      {pending && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
          title="Fotografia em análise"
        >
          <Camera className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Fotografia em análise</span>
        </span>
      )}
    </div>
  );
}

// ── Diálogo: alterar palavra-passe ───────────────────────────────────────────

function ChangePasswordDialog({ open, onClose, userId }: {
  open: boolean; onClose: () => void; userId: string;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => usersService.update(userId, { password: newPassword, currentPassword }),
    onSuccess: () => {
      toast.success('Palavra-passe alterada.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível alterar a palavra-passe.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('A nova palavra-passe precisa de pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('A confirmação não coincide com a nova palavra-passe.');
      return;
    }
    mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar palavra-passe</DialogTitle>
          <DialogDescription>
            Confirme a palavra-passe atual para continuar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Palavra-passe atual</Label>
            <Input
              id="currentPassword" type="password" autoComplete="current-password"
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova palavra-passe</Label>
            <Input
              id="newPassword" type="password" autoComplete="new-password" minLength={6}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
            />
            <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova palavra-passe</Label>
            <Input
              id="confirmPassword" type="password" autoComplete="new-password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Alterar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo: alterar email ───────────────────────────────────────────────────

function ChangeEmailDialog({ open, onClose, userId, currentEmail }: {
  open: boolean; onClose: () => void; userId: string; currentEmail: string;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  useEffect(() => {
    if (open) {
      setEmail(currentEmail);
      setCurrentPassword('');
    }
  }, [open, currentEmail]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => usersService.update(userId, { email, currentPassword }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(queryKeys.users.detail(userId), user);
      toast.success('Email atualizado. Use o novo endereço no próximo início de sessão.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível alterar o email.'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar email de acesso</DialogTitle>
          <DialogDescription>
            É com este endereço que entra na conta e recupera a palavra-passe.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); mutate(); }}
          className="mt-2 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="newEmail">Novo email</Label>
            <Input
              id="newEmail" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emailCurrentPassword">Palavra-passe atual</Label>
            <Input
              id="emailCurrentPassword" type="password" autoComplete="current-password"
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || email === currentEmail}
              className="w-full sm:w-auto"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Alterar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar o perfil…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex items-center gap-4 p-4 sm:p-6">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full sm:h-20 sm:w-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DriverProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: profile, isLoading, isError } = useQuery<ApiUser>({
    queryKey: queryKeys.users.detail(user?.id ?? ''),
    queryFn: async () => {
      const res = await usersService.getById(user!.id);
      return (res as any).user ?? res;
    },
    enabled: !!user?.id,
  });

  const documentsQuery = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
  });

  const photoDoc = documentsQuery.data?.documents.find(
    // d.userId é obrigatório mesmo aqui, onde a tela é sempre do próprio:
    // depender de quem a abre é uma garantia que se perde na primeira vez que
    // alguém reutilizar o componente.
    (d) => d.userId === user?.id && d.type === 'FOTO_PERFIL' && !d.vehicleId,
  );
  // Mostrada assim que enviada. Rejeitada ou expirada volta às iniciais.
  const photoVisible =
    !!photoDoc && (photoDoc.status === 'APPROVED' || photoDoc.status === 'PENDING');

  useEffect(() => {
    if (!photoVisible || !photoDoc) {
      setPhotoUrl(null);
      return;
    }

    let revoked = false;
    let url: string | null = null;

    documentsService
      .getFileObjectUrl(photoDoc.id)
      .then((objectUrl) => {
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        url = objectUrl;
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoDoc?.id, photoVisible]);

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile]);

  const { mutate: saveName, isPending: isSavingName } = useMutation({
    mutationFn: () => usersService.update(user!.id, { name: name.trim() }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(queryKeys.users.detail(user!.id), updated);
      toast.success('Nome atualizado.');
      setIsEditingName(false);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar o nome.'),
  });

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar o perfil.</p>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(user?.id ?? '') })}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  const status = STATUS_META[profile.status] ?? STATUS_META.INACTIVE;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Perfil"
        subtitle="Os seus dados e o acesso à conta"
        icon={<User className="h-5 w-5" />}
      />

      {/* Identidade */}
      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              name={profile.name}
              photoUrl={photoUrl}
              pending={photoDoc?.status === 'PENDING'}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{profile.name}</p>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>
                  {status.label}
                </span>
              </div>
            </div>

            {!isEditingName && (
              <Button
                variant="outline" size="sm" className="shrink-0"
                onClick={() => { setName(profile.name); setIsEditingName(true); }}
              >
                Editar
              </Button>
            )}
          </div>

          {isEditingName && (
            <form
              onSubmit={(e) => { e.preventDefault(); saveName(); }}
              className="mt-4 space-y-3 border-t border-border pt-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name" value={name} minLength={2}
                  onChange={(e) => setName(e.target.value)} required
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button" variant="outline" className="w-full sm:w-auto"
                  onClick={() => { setIsEditingName(false); setName(profile.name); }}
                  disabled={isSavingName}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit" className="w-full sm:w-auto"
                  disabled={isSavingName || name.trim() === profile.name}
                >
                  {isSavingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
                </Button>
              </div>
            </form>
          )}

          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            A fotografia vem do documento "Fotografia de Perfil".{' '}
            <Link to="/app/driver/documents" className="underline underline-offset-2 hover:text-foreground">
              Envie uma nova em Documentos
            </Link>
            {photoDoc?.status === 'PENDING' && ' — a atual ainda está em análise.'}
          </p>
        </CardContent>
      </Card>

      {/* Dados bancários — antes da Segurança porque é o que o motorista vem
          cá fazer quando o pedido de retirada o manda para o Perfil. */}
      <BankAccountSection />

      {/* Segurança */}
      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Segurança</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Palavra-passe e acesso à conta
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <ul>
            <li className="flex items-center gap-3 border-b border-border py-3">
              <Lock className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Palavra-passe</p>
                <p className="truncate text-xs text-muted-foreground">
                  Pedimos a atual para confirmar a alteração
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setPasswordOpen(true)}>
                Alterar
              </Button>
            </li>

            <li className="flex items-center gap-3 border-b border-border py-3">
              <Mail className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Email de acesso</p>
                <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setEmailOpen(true)}>
                Alterar
              </Button>
            </li>

            <li className="flex items-center gap-3 py-3">
              <CalendarDays className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Membro desde</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(profile.createdAt)}
                </p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        userId={profile.id}
      />
      <ChangeEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        userId={profile.id}
        currentEmail={profile.email}
      />
    </div>
  );
}
