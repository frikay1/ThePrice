import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, LogOut, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './context/useAuth'

export function LoginPage() {
  const { login, sessionError, enterGuestMode } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <AuthLayout eyebrow="QUÉ BUENO VERTE" title="Iniciar sesión" subtitle="Entra para ver tus productos y precios guardados.">
    <form className="auth-form" onSubmit={submit}>
      {sessionError && <p className="form-message info-message" role="status">{sessionError}</p>}
      <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Contraseña<span className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /><button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      {error && <p className="form-message error-message" role="alert">{error}</p>}
      <button className="primary-button full-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
      <button className="secondary-button full-button" type="button" onClick={() => { enterGuestMode(); navigate('/', { replace: true }) }}>Continuar como invitado</button>
    </form>
    <p className="auth-switch">¿Aún no tienes cuenta? <Link to="/registro">Crear cuenta</Link></p>
  </AuthLayout>
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await register({ name, email, password, password_confirmation: passwordConfirmation })
      navigate('/', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear la cuenta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <AuthLayout eyebrow="TU ESPACIO DE PRECIOS" title="Crear cuenta" subtitle="Regístrate para guardar tus productos de forma privada.">
    <form className="auth-form" onSubmit={submit}>
      <label>Nombre completo<input autoComplete="name" required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /><small>Usa al menos 8 caracteres, con letras y números.</small></label>
      <label>Confirmar contraseña<input type="password" autoComplete="new-password" required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} /></label>
      {error && <p className="form-message error-message" role="alert">{error}</p>}
      <button className="primary-button full-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando cuenta…' : 'Registrarme'}</button>
    </form>
    <p className="auth-switch">¿Ya tienes cuenta? <Link to="/login">Ya tengo cuenta</Link></p>
  </AuthLayout>
}

export function ProfilePage() {
  const { user, refreshUser, updateName, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    void refreshUser().catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : 'No se pudo cargar el perfil.')
    })
    return () => { active = false }
  }, [refreshUser])

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSavingName(true)
    try {
      await updateName(name)
      setMessage('Nombre actualizado correctamente.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar el nombre.')
    } finally {
      setIsSavingName(false)
    }
  }

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSavingPassword(true)
    try {
      await changePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: passwordConfirmation,
      })
      setCurrentPassword('')
      setNewPassword('')
      setPasswordConfirmation('')
      setMessage('Contraseña actualizada correctamente.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  const signOut = async () => {
    setError('')
    setIsLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cerrar la sesión.')
      setIsLoggingOut(false)
    }
  }

  return <div className="page-container settings-page">
    <div className="page-title"><p className="eyebrow">TU CUENTA</p><h1>Mi perfil</h1><p>Administra tu información y seguridad.</p></div>
    {message && <p className="form-message info-message" role="status">{message}</p>}
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    <section className="settings-card profile-summary">
      <div className="profile-avatar"><UserRound size={22} /></div>
      <div><h2>{user?.name}</h2><p>{user?.email}</p></div>
      <dl><div><dt>Miembros desde</dt><dd>{user?.created_at ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(user.created_at)) : '—'}</dd></div><div><dt>Productos guardados</dt><dd>{user?.products_count ?? 0}</dd></div></dl>
    </section>
    <section className="settings-card"><h2>Editar nombre</h2><form className="profile-form" onSubmit={saveName}><label>Nombre completo<input required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label><button className="primary-button full-button" type="submit" disabled={isSavingName}>{isSavingName ? 'Guardando…' : 'Guardar nombre'}</button></form></section>
    <section className="settings-card"><h2>Cambiar contraseña</h2><form className="profile-form" onSubmit={savePassword}><label>Contraseña actual<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>Nueva contraseña<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label>Confirmar contraseña<input type="password" autoComplete="new-password" required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} /></label><button className="primary-button full-button" type="submit" disabled={isSavingPassword}>{isSavingPassword ? 'Actualizando…' : 'Cambiar contraseña'}</button></form></section>
    <button className="secondary-button profile-logout" type="button" onClick={() => void signOut()} disabled={isLoggingOut}><LogOut size={16} /> {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
  </div>
}

function AuthLayout({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card"><Link to="/login" className="auth-brand"><span className="brand-mark"><UserRound size={18} /></span><strong>The Price</strong></Link><div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{children}</section></main>
}
