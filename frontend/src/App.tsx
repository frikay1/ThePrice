import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, Check, ChevronRight, CircleHelp, Clock3, ExternalLink, Heart, Home, Link2, LogIn, Moon, Plus, Search, Settings as SettingsIcon, ShoppingBag, Sparkles, Sun, Tag, Trash2, TrendingDown, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './context/useAuth'
import { LoginPage, ProfilePage, RegisterPage } from './AuthPages'
import { useApp } from './context/useApp'
import type { PriceProduct, PricePoint } from './data/types'
import { getProductHistory, lookupProduct } from './services/productApi'
import { detectStore, validateProductUrl } from './services/storeDetection'
import { readGuestProducts } from './services/guestProducts'
import { readRecentProductVisits, recordRecentProductVisit } from './services/recentProducts'
import './App.css'

const formatPrice = (price: number, currency = 'MXN') => {
  const amount = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price)
  const symbol = ({ MXN: '$', GBP: '£', USD: 'US$', EUR: '€', CAD: 'CA$' } as Record<string, string>)[currency]
  return symbol ? `${symbol}${amount} ${currency}` : `${currency} ${amount}`
}

function ProductImage({ src, name, className = '' }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  return failed || !src
    ? <div className={`product-image-fallback ${className}`} aria-label={`Imagen no disponible para ${name}`}><ShoppingBag size={26} /></div>
    : <img className={`product-image ${className}`} src={src} alt={name} onError={() => setFailed(true)} />
}

function TrendBadge({ product }: { product: PriceProduct }) {
  if (product.previousPrice === null) return <span className="trend-badge neutral">Primer registro</span>
  const delta = ((product.currentPrice - product.previousPrice) / product.previousPrice) * 100
  if (Math.abs(delta) < 0.05) return <span className="trend-badge neutral"><span>•</span> Sin cambios</span>
  const down = delta < 0
  return <span className={`trend-badge ${down ? 'down' : 'up'}`}>{down ? <ArrowDown size={14} /> : <ArrowUp size={14} />}{Math.abs(delta).toFixed(1)}% {down ? 'menos' : 'más'}</span>
}

function TargetAlertBadge({ product }: { product: PriceProduct }) {
  if (product.targetPrice === null || product.currentPrice > product.targetPrice) return null
  return <span className="target-alert-badge"><Bell size={12} /> Precio objetivo alcanzado</span>
}

function MiniChart({ history }: { history: PricePoint[] }) {
  return <div className="mini-chart" aria-label="Mini gráfica de historial de precios">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={history}>
        <defs><linearGradient id="miniPink" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E8A5BC" stopOpacity={0.35} /><stop offset="100%" stopColor="#E8A5BC" stopOpacity={0.02} /></linearGradient></defs>
        <Area type="monotone" dataKey="price" stroke="#A85D7A" strokeWidth={2} fill="url(#miniPink)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
}

function ProductCard({ product }: { product: PriceProduct }) {
  return <article className="product-card">
    <Link to={`/producto/${product.id}`} className="product-card-main" aria-label={`Ver detalles de ${product.name}`}>
      <ProductImage src={product.image} name={product.name} />
      <div className="product-card-info">
        <span className="store-name">{product.store}</span>
        <h3>{product.name}</h3>
        <div className="price-line"><strong>{formatPrice(product.currentPrice, product.currency)}</strong><TrendBadge product={product} /></div>
        <div className="product-meta"><span>{product.previousPrice === null ? 'Sin precio previo' : `Antes ${formatPrice(product.previousPrice, product.currency)}`}</span><span>Objetivo {product.targetPrice === null ? 'Sin objetivo' : formatPrice(product.targetPrice, product.currency)}</span></div>
        <TargetAlertBadge product={product} />
        {!product.alertEnabled && <span className="variant-label">Alertas desactivadas</span>}
        {product.variantName && <span className="variant-label">{product.variantName}</span>}
      </div>
      <ChevronRight className="card-chevron" size={18} />
    </Link>
    <div className="card-chart-row"><MiniChart history={product.history} /><span>Actualizado<br /><b>{product.updatedAt}</b></span></div>
  </article>
}

function BottomNavigation() {
  return <nav className="bottom-nav" aria-label="Navegación principal">
    <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Home size={19} /><span>Productos</span></NavLink>
    <NavLink to="/nuevo" className={({ isActive }) => `nav-item add-nav ${isActive ? 'active' : ''}`}><span className="nav-plus"><Plus size={22} /></span><span>Nuevo</span></NavLink>
    <NavLink to="/alertas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Bell size={19} /><span>Alertas</span></NavLink>
  </nav>
}

function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isRoot = location.pathname === '/'
  return <div className="app-shell">
    {!isRoot && <header className="sub-header"><button className="icon-button back-button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')} aria-label="Regresar"><ArrowLeft size={20} /></button><span>The Price</span><Link to="/configuracion" className="icon-button" aria-label="Configuración"><SettingsIcon size={19} /></Link></header>}
    <main className={isRoot ? 'main-content home-content' : 'main-content'}>{children}</main>
    <BottomNavigation />
  </div>
}

function HomePage() {
  const { products, isLoading, loadError, reloadProducts, successMessage, dismissSuccess, isGuestMode, guestProductsAvailable, importGuestProducts } = useApp()
  const { user } = useAuth()
  const recentProductsOwnerId = isGuestMode ? 'guest' : user ? String(user.id) : null
  const [recentHistoryState, setRecentHistoryState] = useState<{
    ownerId: string | null
    visits: ReturnType<typeof readRecentProductVisits>
    error: string
  }>({ ownerId: null, visits: [], error: '' })
  const [filter, setFilter] = useState('Todos')
  const [search, setSearch] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [importing, setImporting] = useState(false)
  const [storeFilter, setStoreFilter] = useState('Todas')
  useEffect(() => {
    if (!recentProductsOwnerId) return
    let active = true
    void Promise.resolve().then(() => {
      try {
        const visits = readRecentProductVisits(recentProductsOwnerId)
        if (active) setRecentHistoryState({ ownerId: recentProductsOwnerId, visits, error: '' })
      } catch (error) {
        if (active) setRecentHistoryState({
          ownerId: recentProductsOwnerId,
          visits: [],
          error: error instanceof Error ? error.message : 'No se pudo leer el historial de productos recientes.',
        })
      }
    })
    return () => { active = false }
  }, [recentProductsOwnerId])
  const recentHistoryMatchesOwner = recentHistoryState.ownerId === recentProductsOwnerId
  const recentVisits = recentHistoryMatchesOwner ? recentHistoryState.visits : []
  const recentVisitsError = recentHistoryMatchesOwner ? recentHistoryState.error : ''
  const filterOptions = ['Todos', 'Bajaron', 'Subieron', 'Sin cambios']
  const visibleProducts = products.filter(product => {
    const matchesSearch = `${product.name} ${product.store}`.toLocaleLowerCase('es-MX').includes(search.toLocaleLowerCase('es-MX'))
    const matchesStore = storeFilter === 'Todas' || product.store === storeFilter
    if (!matchesSearch || !matchesStore) return false
    if (product.previousPrice === null) return filter === 'Todos'
    const change = product.currentPrice - product.previousPrice
    return filter === 'Todos' || (filter === 'Bajaron' && change < 0) || (filter === 'Subieron' && change > 0) || (filter === 'Sin cambios' && change === 0)
  })
  const recentProducts = recentVisits
    .map(visit => ({ visit, product: products.find(item => item.id === visit.productId) }))
    .filter((entry): entry is { visit: typeof recentVisits[number]; product: PriceProduct } => Boolean(entry.product))
  const drops = products.filter(product => product.previousPrice !== null && product.currentPrice < product.previousPrice).length
  return <div className="page-container">
    <header className="home-header">
      <div className="brand"><span className="brand-mark"><Heart size={18} fill="currentColor" /></span><div><h1>The Price</h1><p>Tus productos, sus mejores precios</p></div></div>
      {isGuestMode ? <Link to="/login" className="icon-button settings-button" aria-label="Iniciar sesión"><LogIn size={19} /></Link> : <Link to="/configuracion" className="icon-button settings-button" aria-label="Configuración"><SettingsIcon size={20} /></Link>}
    </header>
    {isGuestMode && <div className="form-message info-message guest-banner" role="status">Modo invitado: tus productos se guardan solo en este navegador. <Link to="/login">Inicia sesión</Link></div>}
    {user && guestProductsAvailable > 0 && <div className="form-message info-message guest-import" role="status">
      Tienes {guestProductsAvailable} producto(s) temporales. <button className="text-button" disabled={importing} onClick={async () => {
        if (!window.confirm('¿Importar tus productos temporales a esta cuenta? Los enlaces repetidos se omitirán.')) return
        setImporting(true)
        setImportNotice('')
        try {
          const result = await importGuestProducts()
          setImportNotice(`Importación completada: ${result.imported} agregado(s), ${result.duplicates} duplicado(s) omitido(s).`)
        } catch (error) {
          setImportNotice(error instanceof Error ? error.message : 'No se pudieron importar los productos temporales.')
        } finally {
          setImporting(false)
        }
      }}>{importing ? 'Importando…' : 'Importar con confirmación'}</button>
      {importNotice && <span>{importNotice}</span>}
    </div>}
    <section className="welcome-panel"><div><p className="eyebrow">TU LISTA INTELIGENTE</p><h2>Compra en el<br />momento ideal.</h2><p className="welcome-caption">Sigue precios y encuentra tu mejor momento.</p></div><div className="welcome-art"><Tag size={30} /><span>♡</span></div></section>
    <section className="summary-grid" aria-label="Resumen de productos">
      <div className="summary-card"><span>Guardados</span><strong>{products.length}</strong><ShoppingBag size={17} /></div>
      <div className="summary-card"><span>Con bajada</span><strong>{drops}</strong><TrendingDown size={17} /></div>
      <div className="summary-card"><span>Seguimientos activos</span><strong>{products.filter(p => p.alertEnabled).length}</strong><Bell size={17} /></div>
    </section>
    <section className="recent-products-section" aria-labelledby="recent-products-heading">
      <div className="section-heading"><div><h2 id="recent-products-heading">Lo último que exploraste</h2><span>Hasta 5 productos visitados recientemente</span></div><Clock3 size={19} aria-hidden="true" /></div>
      {recentVisitsError
        ? <div className="form-message error-message" role="alert">{recentVisitsError}</div>
        : isLoading
          ? <div className="recent-products-empty" role="status">Cargando historial…</div>
          : recentProducts.length === 0
            ? <div className="recent-products-empty">Todavía no has explorado productos</div>
            : <div className="recent-products-list">{recentProducts.map(({ visit, product }) =>
              <Link to={`/producto/${product.id}`} className="recent-product-item" key={product.id}>
                <span className="recent-product-info"><strong>{product.name}</strong><span>{product.store}</span></span>
                <time dateTime={visit.visitedAt}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(visit.visitedAt))}</time>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>,
            )}</div>}
    </section>
    <div className="section-heading"><div><h2>Mis productos</h2><span>{products.length} guardados</span></div><Link to="/nuevo" className="small-add"><Plus size={17} /> Agregar</Link></div>
    {successMessage && <div className="form-message info-message api-status-message" role="status">{successMessage}<button className="status-dismiss" onClick={dismissSuccess} aria-label="Cerrar mensaje">×</button></div>}
    {loadError && <div className="form-message error-message api-status-message" role="alert">{loadError}<button className="text-button" onClick={() => void reloadProducts()}>Reintentar</button></div>}
    <label className="product-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por producto o tienda" aria-label="Buscar productos" /></label>
    <div className="filter-row" role="tablist" aria-label="Filtrar productos">{filterOptions.map(option => <button key={option} role="tab" aria-selected={filter === option} className={`filter-chip ${filter === option ? 'selected' : ''}`} onClick={() => setFilter(option)}>{option}</button>)}</div>
    {new Set(products.map(product => product.store)).size > 1 && <label className="store-filter">Tienda<select value={storeFilter} onChange={event => setStoreFilter(event.target.value)}><option>Todas</option>{[...new Set(products.map(product => product.store))].map(store => <option key={store}>{store}</option>)}</select></label>}
    {isLoading
      ? <div className="empty-state" role="status"><span className="spinner loading-spinner" /><p>Cargando tus productos…</p></div>
      : !loadError && products.length === 0
        ? <div className="empty-state"><ShoppingBag size={25} /><p>Aún no tienes productos guardados.</p><Link to="/nuevo" className="small-add"><Plus size={17} /> Agregar producto</Link></div>
        : !loadError && <>
          <div className="product-list">{visibleProducts.map(product => <ProductCard key={product.id} product={product} />)}</div>
          {visibleProducts.length === 0 && <div className="empty-state"><Sparkles size={25} /><p>No hay productos en esta categoría.</p><button className="text-button" onClick={() => setFilter('Todos')}>Ver todos</button></div>}
        </>}
    <p className="demo-note"><CircleHelp size={14} /> Los datos se consultan desde tu cuenta de Laravel.</p>
  </div>
}

function ChartPanel({ history, currency }: { history: PricePoint[]; currency: string }) {
  const [range, setRange] = useState('Todo')
  const points = useMemo(() => {
    if (range === 'Todo') return history
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Number(range))
    return history.filter(point => !point.recordedAt || new Date(point.recordedAt) >= cutoff)
  }, [history, range])
  return <section className="chart-panel">
    <div className="chart-title-row"><div><h3>Historial de precio</h3><span>La evolución de un vistazo</span></div><div className="range-tabs">{[{ label: '7 días', value: '7' }, { label: '30 días', value: '30' }, { label: '90 días', value: '90' }, { label: 'Todo', value: 'Todo' }].map(option => <button className={range === option.value ? 'selected' : ''} key={option.value} onClick={() => setRange(option.value)}>{option.label}</button>)}</div></div>
    {history.length === 0
      ? <p className="chart-empty">Aún no hay registros de precio.</p>
      : points.length === 0
        ? <p className="chart-empty">No hay registros en este periodo.</p>
        : points.length === 1
          ? <><div className="detail-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 12, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#F0E7EA" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8D858B' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8D858B' }} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatPrice(value, currency)} width={82} />
                  <Tooltip formatter={(value) => [formatPrice(Number(value), currency), 'Precio']} />
                  <Line type="monotone" dataKey="price" stroke="#A85D7A" strokeWidth={2.5} dot={{ r: 5, fill: '#A85D7A' }} />
                </LineChart>
              </ResponsiveContainer>
            </div><p className="chart-empty">Solo existe un registro. Todavía no hay suficiente historial para mostrar una tendencia.</p></>
      : <div className="detail-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#F0E7EA" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8D858B' }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis tick={{ fontSize: 10, fill: '#8D858B' }} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatPrice(value, currency)} width={82} />
          <Tooltip formatter={(value) => [formatPrice(Number(value), currency), 'Precio']} contentStyle={{ borderRadius: 12, borderColor: '#F0E7EA', fontSize: 12 }} />
          <Line type="monotone" dataKey="price" stroke="#A85D7A" strokeWidth={2.5} dot={{ r: 3, fill: '#A85D7A', strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>}
  </section>
}

function ProductDetailPage() {
  const { id } = useParams()
  const { products, isLoading, updateTarget, updateProduct, updateProductHistory, refreshProduct, registerManualPrice, updateVariant, deleteProduct, successMessage, dismissSuccess, isGuestMode, toggleAlerts } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const product = products.find(item => item.id === id)
  const productId = product?.id
  const recentProductsOwnerId = isGuestMode ? 'guest' : user ? String(user.id) : null
  const [recentVisitError, setRecentVisitError] = useState('')
  const [editingTarget, setEditingTarget] = useState(false)
  const [target, setTarget] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSavingTarget, setIsSavingTarget] = useState(false)
  const [historyLoadedId, setHistoryLoadedId] = useState<string | null>(null)
  const [historyErrorState, setHistoryErrorState] = useState<{ productId: string; message: string } | null>(null)
  const [historyState, setHistoryState] = useState<{ productId: string; points: PricePoint[] } | null>(null)
  const [isEditingVariant, setIsEditingVariant] = useState(false)
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStore, setEditStore] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editImage, setEditImage] = useState('')
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [variantInput, setVariantInput] = useState('')
  const [isSavingVariant, setIsSavingVariant] = useState(false)
  const [isManualPriceFormOpen, setIsManualPriceFormOpen] = useState(false)
  const [manualPrice, setManualPrice] = useState('')
  const [isSavingManualPrice, setIsSavingManualPrice] = useState(false)
  const [manualRecordedAt, setManualRecordedAt] = useState<string | null>(null)
  useEffect(() => {
    if (!productId || !recentProductsOwnerId) return
    void Promise.resolve()
      .then(() => {
        recordRecentProductVisit(recentProductsOwnerId, productId)
        setRecentVisitError('')
      })
      .catch(error => setRecentVisitError(
        error instanceof Error ? error.message : 'No se pudo guardar el historial de productos recientes.',
      ))
  }, [productId, recentProductsOwnerId])
  useEffect(() => {
    if (!id) return
    if (isGuestMode) {
      let active = true
      void Promise.resolve().then(() => {
        if (!active) return
        const temporary = readGuestProducts().find(item => item.id === id)
        if (temporary) {
          setHistoryState({ productId: id, points: temporary.history })
          setHistoryLoadedId(id)
        }
      })
      return () => { active = false }
    }
    let active = true
    void getProductHistory(id).then(points => {
      if (!active) return
      setHistoryState({ productId: id, points })
      setHistoryErrorState(null)
      updateProductHistory(id, points)
    }).catch(error => {
      if (active) setHistoryErrorState({
        productId: id,
        message: error instanceof Error ? error.message : 'No se pudo cargar el historial de precios.',
      })
    }).finally(() => {
      if (active) setHistoryLoadedId(id)
    })
    return () => { active = false }
  }, [id, isGuestMode, updateProductHistory])
  const isLoadingHistory = historyLoadedId !== id
  const history = historyState && historyState.productId === id ? historyState.points : []
  const historyError = historyErrorState && historyErrorState.productId === id ? historyErrorState.message : ''
  if (!product && isLoading) return <div className="page-container"><div className="empty-state" role="status"><span className="spinner loading-spinner" /><p>Cargando producto…</p></div></div>
  if (!product) return <div className="page-container"><div className="empty-state"><ShoppingBag size={26} /><p>No encontramos este producto.</p><Link to="/" className="text-button">Volver a mis productos</Link></div></div>
  const historyPrices = history.map(point => point.price)
  const average = historyPrices.length ? historyPrices.reduce((sum, price) => sum + price, 0) / historyPrices.length : null
  const initialPrice = historyPrices.length ? historyPrices[0] : null
  const totalVariation = initialPrice === null || initialPrice === 0 ? null : ((product.currentPrice - initialPrice) / initialPrice) * 100
  const saveTarget = async () => {
    const value = target.trim() === '' ? null : Number(target)
    if (value !== null && (!Number.isFinite(value) || value <= 0)) { setNoticeIsError(true); setNotice('Escribe un precio objetivo mayor que cero, o déjalo vacío para quitarlo.'); return }
    setIsSavingTarget(true)
    setNotice('')
    setNoticeIsError(false)
    try {
      const reachedTarget = await updateTarget(product.id, value)
      setEditingTarget(false)
      setNotice(value !== null && reachedTarget ? 'Precio objetivo guardado; el precio actual ya está en o por debajo del objetivo.' : 'Precio objetivo guardado en Supabase.')
    } catch (error) {
      setNoticeIsError(true)
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el precio objetivo.')
    } finally {
      setIsSavingTarget(false)
    }
  }
  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validatedUrl = validateProductUrl(editUrl)
    if (!validatedUrl.valid) {
      setNoticeIsError(true)
      setNotice(validatedUrl.message)
      return
    }
    const detectedStore = detectStore(validatedUrl.url)
    if (detectedStore && detectedStore.name !== editStore.trim()) {
      setNoticeIsError(true)
      setNotice(`El dominio corresponde a ${detectedStore.name}; conserva ese nombre de tienda.`)
      return
    }
    setIsSavingDetails(true)
    setNotice('')
    setNoticeIsError(false)
    try {
      await updateProduct(product.id, {
        name: editName.trim(),
        store: editStore.trim(),
        url: validatedUrl.url,
        sku: product.sku,
        variant_name: product.variantName,
        image: editImage.trim() || null,
      })
      setIsEditingDetails(false)
      setNotice('Datos del producto actualizados.')
    } catch (error) {
      setNoticeIsError(true)
      setNotice(error instanceof Error ? error.message : 'No se pudieron actualizar los datos del producto.')
    } finally {
      setIsSavingDetails(false)
    }
  }
  const saveVariant = async () => {
    const value = variantInput.trim()
    if (value.includes(',')) {
      setNoticeIsError(true)
      setNotice('Ingresa una sola variante seleccionada, por ejemplo “Individual”.')
      return
    }
    setIsSavingVariant(true)
    setNotice('')
    setNoticeIsError(false)
    try {
      await updateVariant(product.id, value || null)
      setIsEditingVariant(false)
      setNotice('Variante actualizada.')
    } catch (error) {
      setNoticeIsError(true)
      setNotice(error instanceof Error ? error.message : 'No se pudo actualizar la variante.')
    } finally {
      setIsSavingVariant(false)
    }
  }
  const saveManualPrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(manualPrice)
    if (!Number.isFinite(value) || value <= 0) {
      setNoticeIsError(true)
      setNotice('Ingresa un precio mayor que cero.')
      return
    }
    setIsSavingManualPrice(true)
    setNotice('')
    setNoticeIsError(false)
    try {
      const result = await registerManualPrice(product.id, value)
      setHistoryState({ productId: product.id, points: result.product.history })
      setManualRecordedAt(result.recordedAt)
      setNotice(result.changed
        ? `${result.message} ${result.direction === 'down' ? 'El precio bajó.' : 'El precio subió.'}${result.reachedTarget ? ' Alcanzó el precio objetivo.' : ''}`
        : 'El precio sigue igual. No se agregó un punto al historial.')
      setIsManualPriceFormOpen(false)
      setManualPrice('')
    } catch (error) {
      setNoticeIsError(true)
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el nuevo precio.')
    } finally {
      setIsSavingManualPrice(false)
    }
  }
  return <div className="page-container detail-page">
    {recentVisitError && <div className="form-message error-message" role="alert">{recentVisitError}</div>}
    <div className="detail-hero"><ProductImage src={product.image} name={product.name} className="detail-product-image" /><div className="detail-product-copy"><span className="store-name">{product.store}</span><h1>{product.name}{product.variantName ? ` · ${product.variantName}` : ''}</h1><div className="detail-price">{formatPrice(product.currentPrice, product.currency)} <TrendBadge product={product} /></div><TargetAlertBadge product={product} /><span className="previous-price">{product.previousPrice === null ? 'Aún no hay un precio anterior registrado' : `Precio anterior: ${formatPrice(product.previousPrice, product.currency)}`}</span></div></div>
    <a className="store-link" href={product.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Ver en tienda <ArrowRight size={16} /></a>
    {!isEditingDetails
      ? <button className="text-button edit-product-button" onClick={() => {
          setEditName(product.name)
          setEditStore(product.store)
          setEditUrl(product.sourceUrl)
          setEditImage(product.image ?? '')
          setIsEditingDetails(true)
        }}>Editar producto</button>
      : <form className="form-card product-edit-form" onSubmit={event => void saveDetails(event)}>
          <h2>Editar datos del producto</h2>
          <label>Nombre<input required maxLength={255} value={editName} onChange={event => setEditName(event.target.value)} /></label>
          <label>Tienda<input required maxLength={255} value={editStore} onChange={event => setEditStore(event.target.value)} /></label>
          <label>Enlace HTTPS<input required type="url" value={editUrl} onChange={event => setEditUrl(event.target.value)} /></label>
          <label>Imagen HTTPS (opcional)<input type="url" value={editImage} onChange={event => setEditImage(event.target.value)} /></label>
          <div className="manual-price-actions"><button className="primary-button" type="submit" disabled={isSavingDetails}>{isSavingDetails ? 'Guardando…' : 'Guardar cambios'}</button><button className="secondary-button" type="button" disabled={isSavingDetails} onClick={() => setIsEditingDetails(false)}>Cancelar</button></div>
        </form>}
    <div className="detail-info-grid">
      <div><span>Variante seleccionada</span>{isEditingVariant ? <div className="target-edit"><input maxLength={255} value={variantInput} onChange={event => setVariantInput(event.target.value)} aria-label="Variante seleccionada" placeholder="Ej. Individual" /><button disabled={isSavingVariant} onClick={() => void saveVariant()} aria-label="Guardar variante">{isSavingVariant ? <span className="spinner" /> : <Check size={17} />}</button></div> : <strong>{product.variantName || 'Sin especificar'} <button className="inline-edit" onClick={() => { setVariantInput(product.variantName ?? ''); setIsEditingVariant(true) }}>Editar</button></strong>}</div>
      <div><span>Precio objetivo</span>{editingTarget ? <div className="target-edit"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} aria-label="Precio objetivo" placeholder="Vacío para quitar" /><button disabled={isSavingTarget} onClick={() => void saveTarget()} aria-label="Guardar objetivo">{isSavingTarget ? <span className="spinner" /> : <Check size={17} />}</button></div> : <strong>{product.targetPrice === null ? 'Sin definir' : formatPrice(product.targetPrice, product.currency)} <button className="inline-edit" onClick={() => { setTarget(product.targetPrice === null ? '' : String(product.targetPrice)); setEditingTarget(true) }}>Editar</button></strong>}</div>
      <div><span>Alertas de precio objetivo</span><strong><label className="inline-toggle"><input type="checkbox" checked={product.alertEnabled} onChange={event => toggleAlerts(product.id, event.target.checked)} /> {product.alertEnabled ? 'Activas' : 'Desactivadas'}</label></strong></div>
      <div><span>Precio inicial</span><strong>{initialPrice === null ? '—' : formatPrice(initialPrice, product.currency)}</strong></div>
      <div><span>Variación total</span><strong>{totalVariation === null ? 'Sin historial previo' : `${totalVariation < 0 ? '' : '+'}${totalVariation.toFixed(1)}%`}</strong></div>
      <div><span>Mínimo registrado</span><strong>{historyPrices.length ? formatPrice(Math.min(...historyPrices), product.currency) : '—'}</strong></div>
      <div><span>Máximo registrado</span><strong>{historyPrices.length ? formatPrice(Math.max(...historyPrices), product.currency) : '—'}</strong></div>
      <div><span>Precio promedio</span><strong>{average === null ? '—' : formatPrice(average, product.currency)}</strong></div>
      <div><span>Última actualización</span><strong>{product.updatedAt}</strong></div>
    </div>
    {notice && <p className={`inline-notice ${noticeIsError ? 'error-message' : ''}`} role={noticeIsError ? 'alert' : 'status'}>{notice}</p>}
    {manualRecordedAt && <p className="inline-notice" role="status">Registro guardado con hora del servidor: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(manualRecordedAt))}</p>}
    {successMessage && <p className="inline-notice" role="status">{successMessage}<button className="status-dismiss" onClick={dismissSuccess} aria-label="Cerrar mensaje">×</button></p>}
    {historyError && <p className="form-message error-message" role="alert">{historyError}<button className="text-button" onClick={() => window.location.reload()}>Reintentar</button></p>}
    <p className="inline-notice" role="status">{isGuestMode
      ? 'Producto temporal: el historial y los precios se guardan solo en este navegador.'
      : 'La consulta automática no está integrada para esta tienda. El historial registra precios confirmados manualmente.'}</p>
    <ChartPanel history={history} currency={product.currency} />
    {isLoadingHistory && <p className="inline-notice" role="status"><span className="spinner" /> Cargando historial real…</p>}
    {product.currency === 'MXN' && <section className="manual-price-panel">
      {!isManualPriceFormOpen
        ? <button className="secondary-button" onClick={() => { setManualPrice(''); setManualRecordedAt(null); setIsManualPriceFormOpen(true) }}>Registrar nuevo precio</button>
        : <form className="manual-price-form" onSubmit={event => void saveManualPrice(event)}>
          <div className="form-section-heading"><span className="step-number">↻</span><div><h2>Registrar nuevo precio</h2><p>Precio actual: {formatPrice(product.currentPrice, product.currency)}</p></div></div>
          <label className="field-label">Nuevo precio (MXN)<input autoFocus required type="number" min="0.01" step="0.01" inputMode="decimal" value={manualPrice} onChange={event => setManualPrice(event.target.value)} placeholder="0.00" /></label>
          <p className="manual-price-date">{isGuestMode ? 'La fecha se asignará en este navegador.' : 'La fecha y hora se asignarán al guardar, usando el servidor.'}</p>
          <div className="manual-price-actions"><button className="primary-button" type="submit" disabled={isSavingManualPrice}>{isSavingManualPrice ? <><span className="spinner" /> Guardando…</> : 'Guardar precio'}</button><button className="secondary-button" type="button" disabled={isSavingManualPrice} onClick={() => setIsManualPriceFormOpen(false)}>Cancelar</button></div>
        </form>}
    </section>}
    <div className="detail-actions"><button className="secondary-button" disabled={isRefreshing || isGuestMode || product.store !== 'Books to Scrape'} onClick={async () => {
      setIsRefreshing(true)
      setNotice('')
      setNoticeIsError(false)
      try {
        const result = await refreshProduct(product.id)
        setHistoryState({ productId: product.id, points: result.product.history })
        setNotice(result.reachedTarget ? `${result.message} El precio está en o por debajo del objetivo.` : result.message)
      } catch (error) {
        setNoticeIsError(true)
        setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el precio. El historial se conservó.')
      } finally {
        setIsRefreshing(false)
      }
    }}>{isGuestMode || product.store !== 'Books to Scrape' ? 'Consulta automática no disponible' : isRefreshing ? <><span className="spinner" /> Consultando…</> : 'Actualizar precio'}</button><button className="delete-button" disabled={isDeleting} onClick={async () => {
      if (!window.confirm('¿Eliminar este producto de tu lista?')) return
      setIsDeleting(true)
      try {
        await deleteProduct(product.id)
        navigate('/')
      } catch (error) {
        setNoticeIsError(true)
        setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el producto.')
      } finally {
        setIsDeleting(false)
      }
    }}><Trash2 size={16} /> {isDeleting ? 'Eliminando…' : 'Eliminar'}</button></div>
    <p className="demo-note"><CircleHelp size={14} /> El historial muestra únicamente registros que la API ha guardado.</p>
  </div>
}

function AddProductPage() {
  const { addProduct } = useApp()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validUrl, setValidUrl] = useState('')
  const [name, setName] = useState('')
  const [store, setStore] = useState('')
  const [price, setPrice] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const currency = 'MXN'
  const [variantName, setVariantName] = useState('')
  const [image, setImage] = useState('')
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [frequency, setFrequency] = useState('Diaria')
  const [isSaving, setIsSaving] = useState(false)
  const [hasLookupData, setHasLookupData] = useState(false)
  const [productHtml, setProductHtml] = useState<string | null>(null)
  const [isHtmlVisible, setIsHtmlVisible] = useState(false)
  const [htmlCopyMessage, setHtmlCopyMessage] = useState('')
  const [htmlTruncated, setHtmlTruncated] = useState(false)

  const updateUrl = (value: string) => {
    setUrl(value)
    setValidUrl('')
    setError('')
    setNotice('')
    setHasLookupData(false)
    setProductHtml(null)
    setIsHtmlVisible(false)
    setHtmlCopyMessage('')
    setHtmlTruncated(false)
    setName('')
    setStore('')
    setPrice('')
    setTargetPrice('')
    setVariantName('')
    setImage('')
    const detected = detectStore(value)
    if (detected) setStore(detected.name)
  }
  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) { setError('El portapapeles está vacío.'); return }
      updateUrl(text.trim())
    } catch { setError('No se pudo acceder al portapapeles. Pega el enlace directamente en el campo.') }
  }
  const fetchPreview = async () => {
    setError(''); setNotice('')
    setProductHtml(null)
    setIsHtmlVisible(false)
    setHtmlCopyMessage('')
    setHtmlTruncated(false)
    const validatedUrl = validateProductUrl(url)
    if (!validatedUrl.valid) { setError(validatedUrl.message); return }
    const host = new URL(validatedUrl.url).hostname.toLowerCase()
    if (host === 'books.toscrape.com') {
      setIsLoading(true)
      setValidUrl(validatedUrl.url)
      setHasLookupData(false)
      try {
        const result = await lookupProduct(validatedUrl.url)
        setName(result.name)
        setStore(result.store)
        setImage(result.image ?? '')
        setProductHtml(result.html ?? null)
        setHtmlTruncated(result.html_truncated ?? false)
        setNotice(result.notice)
      } catch (caught) {
        setNotice(caught instanceof Error ? caught.message : 'Precio no disponible. Completa los datos manualmente.')
      } finally {
        setIsLoading(false)
      }
      return
    }
    const detected = detectStore(validatedUrl.url)
    setValidUrl(validatedUrl.url)
    setStore(detected?.name ?? '')
    setHasLookupData(false)
    setNotice(detected
      ? `Tienda detectada: ${detected.name}. Precio no disponible: no hay una integración oficial habilitada; ingresa los datos confirmados manualmente.`
      : 'Tienda no reconocida. Puedes agregarla manualmente; no se consultarán servidores desconocidos.')
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const validatedUrl = validateProductUrl(validUrl)
    if (!validatedUrl.valid) { setError(validatedUrl.message); return }
    if (!validUrl) { setError('Primero valida el enlace del producto.'); return }
    const productHost = new URL(validUrl).hostname.toLowerCase().replace(/\.$/, '')
    if (productHost === 'books.toscrape.com' || productHost.endsWith('.books.toscrape.com')) {
      setError('Books to Scrape es solo una fuente de demostración y no se pueden guardar sus productos.')
      return
    }
    if (!name.trim() || !store.trim() || !Number(price) || Number(price) <= 0) { setError('Completa nombre, tienda y un precio mayor que cero.'); return }
    setIsSaving(true)
    try {
      await addProduct({
        name: name.trim(),
        store: store.trim(),
        currentPrice: Number(price),
        targetPrice: targetPrice.trim() ? Number(targetPrice) : null,
        currency,
        sku: null,
        variantName: variantName.trim() || null,
        image: image.trim() || null,
        sourceUrl: validUrl,
        alertEnabled,
      })
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el producto.')
    } finally {
      setIsSaving(false)
    }
  }
  return <div className="page-container add-page">
    <div className="page-title"><p className="eyebrow">AMPLÍA TU LISTA</p><h1>Nuevo producto</h1><p>Pega el enlace y agrega tus datos para comenzar.</p></div>
    <section className="form-card url-card">
      <label htmlFor="product-url">Enlace del producto</label>
      <div className="url-input-row"><Link2 size={18} /><input id="product-url" type="url" inputMode="url" autoCapitalize="none" placeholder="https://tienda.com/producto" value={url} onChange={e => updateUrl(e.target.value)} /><button className="paste-button" type="button" onClick={pasteUrl}>Pegar</button></div>
      <button className="primary-button full-button" type="button" onClick={fetchPreview} disabled={isLoading}>{isLoading ? <><span className="spinner" /> Obteniendo…</> : 'Obtener datos'}</button>
      {error && <p className="form-message error-message" role="alert">{error}</p>}
      {notice && <p className="form-message info-message" role="status">{notice}</p>}
    </section>
    {validUrl && <form className="form-card product-form" onSubmit={handleSubmit}>
      <div className="form-section-heading"><span className="step-number">1</span><div><h2>Datos del producto</h2><p>{hasLookupData ? 'Revisa y edita la vista previa antes de guardar.' : 'Captura manualmente datos reales; no se extraen automáticamente.'}</p></div></div>
      <div className="preview-product">
        <ProductImage src={image || null} name={name || 'Vista previa'} />
        <div><strong>{name || 'Añade el nombre del producto'}</strong><span>{store || 'Tienda'}</span></div>
      </div>
      <div className="form-fields">
        <label>Nombre del producto<input required value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Audífonos inalámbricos" /></label>
        <label>Tienda<input required value={store} onChange={e => setStore(e.target.value)} placeholder="Ej. Liverpool" /></label>
        <label>Precio actual<span>{price ? null : <small>Precio no disponible: ingrésalo manualmente</small>}<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></span></label>
        <label>Moneda<span className="fixed-currency">MXN — Peso mexicano</span></label>
        <label>Nombre de variante (opcional)<input value={variantName} onChange={e => setVariantName(e.target.value)} placeholder="Ej. Individual" /></label>
        <label>URL de imagen (opcional)<input type="url" inputMode="url" value={image} onChange={e => setImage(e.target.value)} placeholder="https://…" /></label>
      </div>
      <a className="original-link" href={validUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir enlace original</a>
      <div className="form-divider" />
      <div className="form-section-heading"><span className="step-number">2</span><div><h2>Preferencias</h2><p>El precio objetivo se envía a Laravel.</p></div></div>
      <label className="field-label">Precio objetivo (MXN)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="Opcional" /></label>
      <label className="toggle-row"><span><strong>Activar alertas</strong><small>Avisos dentro de The Price al llegar al objetivo o bajar el precio</small></span><input type="checkbox" checked={alertEnabled} onChange={e => setAlertEnabled(e.target.checked)} /></label>
      <label className="field-label">Frecuencia preferida<select value={frequency} onChange={e => setFrequency(e.target.value)}><option>Diaria</option><option>Semanal</option><option>Mensual</option></select></label>
      {error && <p className="form-message error-message" role="alert">{error}</p>}
      <button className="primary-button full-button save-button" type="submit" disabled={isSaving}>{isSaving ? <><span className="spinner" /> Guardando…</> : <>Guardar y rastrear <ArrowRight size={17} /></>}</button>
      <p className="local-disclaimer">No se inventan precios. Las alertas se calculan con el historial disponible; las tiendas aún requieren actualización manual.</p>
      <section className="html-viewer">
        <button className="html-view-toggle" type="button" aria-expanded={isHtmlVisible} onClick={() => {
          setIsHtmlVisible(visible => !visible)
          setHtmlCopyMessage('')
        }}>Ver HTML</button>
        {isHtmlVisible && <div className="html-view-content">
          {productHtml === null
            ? <p className="html-unavailable">El código HTML de esta página no está disponible</p>
            : <>
              {htmlTruncated && <p className="html-truncated">Se muestra el inicio del HTML; el contenido se limitó por seguridad.</p>}
              <pre className="html-code">{productHtml}</pre>
              <div className="html-view-actions">
                <button className="secondary-button" type="button" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(productHtml)
                    setHtmlCopyMessage('HTML copiado.')
                  } catch {
                    setHtmlCopyMessage('No se pudo copiar el HTML desde este dispositivo.')
                  }
                }}>Copiar HTML</button>
                {htmlCopyMessage && <span className="html-copy-message" role="status">{htmlCopyMessage}</span>}
                <button className="secondary-button" type="button" onClick={() => {
                  setIsHtmlVisible(false)
                  setHtmlCopyMessage('')
                }}>Ocultar HTML</button>
              </div>
            </>}
        </div>}
      </section>
    </form>}
  </div>
}

function AlertsPage() {
  const { products, readAlerts, markAllRead, markAlertRead } = useApp()
  const [filter, setFilter] = useState<'Todas' | 'Sin leer' | 'Leídas'>('Todas')
  const alerts = products.filter(item => item.alertEnabled && (
    (item.previousPrice !== null && item.currentPrice < item.previousPrice)
    || (item.targetPrice !== null && item.currentPrice <= item.targetPrice)
  ))
  const shown = alerts.filter(item => filter === 'Todas' || (filter === 'Sin leer' ? !readAlerts.includes(getAlertKey(item)) : readAlerts.includes(getAlertKey(item))))
  return <div className="page-container">
    <div className="page-title alerts-heading"><p className="eyebrow">A TIEMPO PARA APROVECHAR</p><h1>Alertas</h1><p>Los cambios importantes, en un solo lugar.</p></div>
    <div className="alerts-toolbar"><div className="filter-row">{(['Todas', 'Sin leer', 'Leídas'] as const).map(item => <button key={item} onClick={() => setFilter(item)} className={`filter-chip ${filter === item ? 'selected' : ''}`}>{item}</button>)}</div><button className="mark-read" onClick={markAllRead}><Check size={14} /> Marcar leídas</button></div>
    <div className="alert-list">{shown.map(product => {
      const percent = product.previousPrice === null || product.previousPrice === 0 ? 0 : Math.abs(((product.currentPrice - product.previousPrice) / product.previousPrice) * 100)
      const targetReached = product.targetPrice !== null && product.currentPrice <= product.targetPrice
      const isRead = readAlerts.includes(getAlertKey(product))
      return <article key={getAlertKey(product)} className={`alert-card ${isRead ? 'is-read' : ''}`}>
        <ProductImage src={product.image} name={product.name} />
        <div className="alert-content"><span className="store-name">{product.store}</span><h2>{product.name}</h2><div className="alert-prices">{product.previousPrice !== null && product.currentPrice < product.previousPrice && <s>{formatPrice(product.previousPrice, product.currency)}</s>}<strong>{formatPrice(product.currentPrice, product.currency)}</strong></div>{targetReached ? <TargetAlertBadge product={product} /> : <span className="trend-badge down"><ArrowDown size={13} /> Bajó {percent.toFixed(1)}%</span>}<small>{product.updatedAt} · {isRead ? 'Leída' : targetReached ? 'Objetivo alcanzado' : 'Bajada registrada'}</small></div>
        {!isRead && <button className="mark-read" onClick={() => markAlertRead(product.id)}>Marcar leída</button>}
        <Link to={`/producto/${product.id}`} className="alert-open" aria-label={`Abrir detalle de ${product.name}`}><ChevronRight size={19} /></Link>
      </article>
    })}</div>
    {shown.length === 0 && <div className="empty-state"><Bell size={26} /><p>No hay alertas en esta categoría.</p></div>}
    <p className="demo-note"><CircleHelp size={14} /> Avisos locales basados en precios reales del historial. No se envían notificaciones fuera de The Price.</p>
  </div>
}

function SettingsPage() {
  const { theme, setTheme } = useApp()
  const { user } = useAuth()
  return <div className="page-container settings-page">
    <div className="page-title"><p className="eyebrow">TU ESPACIO</p><h1>Configuración</h1><p>Personaliza tu experiencia.</p></div>
    <section className="settings-card"><h2>Cuenta</h2>{user ? <Link to="/perfil" className="setting-row profile-setting"><div className="setting-icon"><UserRound size={17} /></div><div className="setting-copy"><strong>Mi perfil</strong><span>{user.email}</span></div><ChevronRight size={17} /></Link> : <Link to="/login" className="setting-row profile-setting"><div className="setting-icon"><LogIn size={17} /></div><div className="setting-copy"><strong>Iniciar sesión</strong><span>Conecta tu cuenta para sincronizar tus productos.</span></div><ChevronRight size={17} /></Link>}</section>
    <section className="settings-card"><h2>Apariencia</h2><div className="setting-row"><div className="setting-icon"><Sun size={17} /></div><div className="setting-copy"><strong>Tema de la aplicación</strong><span>Elige el estilo que prefieras</span></div><select value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')} aria-label="Tema"><option value="light">Claro</option><option value="dark">Oscuro</option></select></div></section>
    <section className="settings-card"><h2>Preferencias</h2><div className="setting-row"><div className="setting-icon"><Bell size={17} /></div><div className="setting-copy"><strong>Alertas por producto</strong><span>Actívalas o desactívalas en el detalle de cada producto.</span></div></div><div className="setting-row"><div className="setting-icon"><TrendingDown size={17} /></div><div className="setting-copy"><strong>Actualización de precios</strong><span>Las tiendas actualmente requieren confirmar el precio manualmente.</span></div></div><div className="setting-row"><div className="setting-icon"><Tag size={17} /></div><div className="setting-copy"><strong>Moneda</strong><span>Pesos mexicanos</span></div><span className="setting-value">MXN</span></div></section>
    <section className="settings-card about-card"><h2>Acerca de The Price</h2><p>Una forma sencilla de seguir los precios que te interesan.</p><div className="about-version"><span>Versión de demostración</span><span>1.0.0</span></div><div className="demo-callout"><Moon size={16} /><span>Los cambios de tema y preferencias se mantienen solo durante esta sesión.</span></div></section>
  </div>
}

function AppRoutes() {
  const { user, isCheckingSession, isGuestMode } = useAuth()
  const location = useLocation()

  if (isCheckingSession) return <div className="auth-loading" role="status">Comprobando sesión…</div>
  if (!user && (location.pathname === '/login' || location.pathname === '/registro')) {
    return <Routes><Route path="/registro" element={<RegisterPage />} /><Route path="*" element={<LoginPage />} /></Routes>
  }
  if (!user && !isGuestMode) return <Routes><Route path="/registro" element={<RegisterPage />} /><Route path="*" element={<LoginPage />} /></Routes>
  if (user && (location.pathname === '/login' || location.pathname === '/registro')) return <Navigate to="/" replace />

  return <AppShell><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/nuevo" element={<AddProductPage />} />
    <Route path="/alertas" element={<AlertsPage />} />
    <Route path="/configuracion" element={<SettingsPage />} />
    <Route path="/perfil" element={user ? <ProfilePage /> : <Navigate to="/login" replace />} />
    <Route path="/producto/:id" element={<ProductDetailPage />} />
    <Route path="*" element={<HomePage />} />
  </Routes></AppShell>
}

function App() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    let removeListener: (() => void) | undefined
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) window.history.back()
      else void CapacitorApp.exitApp()
    }).then(listener => {
      if (active) removeListener = () => { void listener.remove() }
      else void listener.remove()
    })
    return () => {
      active = false
      removeListener?.()
    }
  }, [])

  return <BrowserRouter><AuthProvider><AppProvider><AppRoutes /></AppProvider></AuthProvider></BrowserRouter>
}

function getAlertKey(product: PriceProduct): string {
  const kind = product.targetPrice !== null && product.currentPrice <= product.targetPrice ? 'target' : 'drop'
  return `${product.id}:${kind}:${product.currentPrice}`
}

export default App
