"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../../lib/auth/auth-context";
import { ApiClient, ApiError, StaleTenantResponseError, createApiClient } from "../../../../../lib/http/api-client";
import { selectedFarmFromResponse, normalizeFarmResponse, type BreedingFarmSelectionResponse } from "../../../../reproducao/reproduction-data";
import { AppLoadingState } from "../../../../components/app-loading-state";
import { AuthenticatedShell } from "../../../../components/authenticated-shell";
import { DashboardIcon } from "../../../../components/dashboard-icons";

interface BirdSummary {
  birdId: string;
  name: string;
  ringNumber: string | null;
  speciesPopularName: string;
}

interface BirdCompetition {
  birdId: string;
  category: string | null;
  competitionId: string;
  createdAtUtc: string;
  date: string | null;
  location: string | null;
  name: string;
  notes: string | null;
  placement: number | null;
  updatedAtUtc: string;
}

interface BirdCompetitionListResponse {
  breedingFarmId: string;
  birdId: string;
  items: BirdCompetition[];
}

type LoadState = "blocked" | "error" | "loading" | "ready";

interface CompetitionHistoryScreenProps {
  birdId: string;
  competitionId?: string;
}

interface CompetitionFormValues {
  category: string;
  date: string;
  location: string;
  name: string;
  notes: string;
  placement: string;
}

type CompetitionFormErrors = Partial<Record<keyof CompetitionFormValues | "form", string>>;

function formValuesFromCompetition(competition: BirdCompetition): CompetitionFormValues {
  return {
    category: competition.category ?? "",
    date: competition.date ?? "",
    location: competition.location ?? "",
    name: competition.name,
    notes: competition.notes ?? "",
    placement: competition.placement?.toString() ?? ""
  };
}

function validateCompetitionForm(values: CompetitionFormValues): CompetitionFormErrors {
  const errors: CompetitionFormErrors = {};
  const today = new Date().toISOString().slice(0, 10);
  if (!values.name.trim()) errors.name = "Informe o nome da competição.";
  else if (values.name.trim().length > 200) errors.name = "O nome pode ter até 200 caracteres.";
  if (values.date && values.date > today) errors.date = "A data não pode ser posterior a hoje.";
  if (values.category.trim().length > 200) errors.category = "A categoria pode ter até 200 caracteres.";
  if (values.placement && (!/^\d+$/.test(values.placement) || Number(values.placement) <= 0)) {
    errors.placement = "Informe uma colocação com número inteiro positivo.";
  }
  if (values.location.trim().length > 200) errors.location = "O local pode ter até 200 caracteres.";
  if (values.notes.trim().length > 2000) errors.notes = "As observações podem ter até 2.000 caracteres.";
  return errors;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function loadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sua sessão expirou. Entre novamente para consultar este histórico.";
  if (error instanceof ApiError && error.status === 404) return "A ave ou a competição não está disponível neste criatório.";
  if (error instanceof ApiError && error.status === 409) return "Selecione um criatório para consultar o histórico de competições.";
  if (error instanceof ApiError && error.status >= 500) return "O serviço está indisponível no momento. Tente novamente em instantes.";
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
  return "Não foi possível consultar o histórico. Tente novamente.";
}

function StateMessage({ heading, headingLevel = "h1", message, retry, action }: Readonly<{ heading: string; headingLevel?: "h1" | "h2"; message: string; retry?: () => void; action?: React.ReactNode }>) {
  const Heading = headingLevel;
  return (
    <section className="document-history-state competition-history-state" role={retry ? "alert" : "status"}>
      <span aria-hidden="true" className="competition-history-icon"><DashboardIcon name="trophy" /></span>
      <Heading>{heading}</Heading>
      <span>{message}</span>
      {retry && <button className="auth-secondary-action" onClick={retry} type="button">Tentar novamente</button>}
      {action}
    </section>
  );
}

export function CompetitionHistoryScreen({ birdId, competitionId }: CompetitionHistoryScreenProps) {
  const { refresh, session, status } = useAuth();
  const client = useRef<ApiClient | null>(null);
  const requestVersion = useRef(0);
  const [farmName, setFarmName] = useState("Criatório selecionado");
  const [farmState, setFarmState] = useState<LoadState>("loading");
  const [bird, setBird] = useState<BirdSummary>();
  const [items, setItems] = useState<BirdCompetition[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<BirdCompetition>();
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<CompetitionFormValues>();
  const [formErrors, setFormErrors] = useState<CompetitionFormErrors>({});
  const [formError, setFormError] = useState("");
  const [hasEditConflict, setHasEditConflict] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [hasDeleteConflict, setHasDeleteConflict] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteComplete, setDeleteComplete] = useState(false);
  const csrfToken = useRef<string | undefined>(undefined);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  if (!client.current) client.current = createApiClient(() => csrfToken.current);

  const load = useCallback(async (recoverSession = true) => {
    const version = ++requestVersion.current;
    setFarmState("loading");
    setError("");
    setBird(undefined);
    setItems([]);
    setSelectedCompetition(undefined);
    setIsEditing(false);
    setFormValues(undefined);
    setFormErrors({});
    setFormError("");
    setActionNotice("");
    setDeleteComplete(false);
    try {
      const farms = await client.current!.request<BreedingFarmSelectionResponse>("api/breeding-farms");
      if (version !== requestVersion.current) return;
      const selectedFarm = selectedFarmFromResponse(normalizeFarmResponse(farms));
      if (!selectedFarm) {
        client.current!.setTenant(undefined);
        setFarmName("Criatório selecionado");
        setFarmState("blocked");
        return;
      }
      client.current!.setTenant(selectedFarm.breedingFarmId);
      setFarmName(selectedFarm.name);
      const [birdResponse, competitionResponse] = await Promise.all([
        client.current!.request<BirdSummary>(`api/birds/${encodeURIComponent(birdId)}`),
        competitionId
          ? client.current!.request<BirdCompetition>(`api/birds/${encodeURIComponent(birdId)}/competitions/${encodeURIComponent(competitionId)}`)
          : client.current!.request<BirdCompetitionListResponse>(`api/birds/${encodeURIComponent(birdId)}/competitions`)
      ]);
      if (version !== requestVersion.current) return;
      setBird(birdResponse);
      if (competitionId) setSelectedCompetition(competitionResponse as BirdCompetition);
      else setItems((competitionResponse as BirdCompetitionListResponse).items);
      setFarmState("ready");
    } catch (loadFailure) {
      if (version !== requestVersion.current || loadFailure instanceof StaleTenantResponseError) return;
      if (loadFailure instanceof ApiError && loadFailure.status === 401 && recoverSession) {
        const result = await refresh({ showLoading: false });
        if (result.ok && version === requestVersion.current) {
          await load(false);
          return;
        }
      }
      setError(loadError(loadFailure));
      setFarmState(loadFailure instanceof ApiError && loadFailure.status === 409 ? "blocked" : "error");
    }
  }, [birdId, competitionId, refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
    return () => { requestVersion.current += 1; };
  }, [load, status]);

  useEffect(() => {
    if (wasEditing.current && !isEditing && selectedCompetition) editButtonRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing, selectedCompetition]);

  function startEditing() {
    if (!selectedCompetition) return;
    setFormValues(formValuesFromCompetition(selectedCompetition));
    setFormErrors({});
    setFormError("");
    setActionNotice("");
    setHasEditConflict(false);
    setIsEditing(true);
  }

  function stopEditing() {
    setIsEditing(false);
    setFormValues(undefined);
    setFormErrors({});
    setFormError("");
    setHasEditConflict(false);
  }

  function changeFormValue(field: keyof CompetitionFormValues, value: string) {
    setFormValues((current) => current ? { ...current, [field]: value } : current);
    setFormErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
    setActionNotice("");
  }

  async function withSessionRecovery<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (requestError) {
      if (!(requestError instanceof ApiError) || requestError.status !== 401) throw requestError;
      csrfToken.current = undefined;
      const result = await refresh({ showLoading: false });
      if (result.ok) return request();
      throw requestError;
    }
  }

  async function ensureAntiforgeryToken() {
    if (!csrfToken.current) csrfToken.current = await client.current!.fetchAntiforgeryToken();
  }

  function mutationErrorMessage(mutationError: unknown): string {
    if (mutationError instanceof ApiError && mutationError.status === 401) {
      return "Sua sessão expirou. Entre novamente para continuar.";
    }
    if (mutationError instanceof ApiError && mutationError.status === 404) {
      return "Esta competição não está mais disponível neste criatório.";
    }
    if (mutationError instanceof ApiError && mutationError.status === 409) {
      return "O estado do criatório ou da competição mudou. Recarregue os dados e tente novamente.";
    }
    if (mutationError instanceof ApiError && mutationError.status >= 500) {
      return "O serviço está indisponível no momento. Tente novamente em instantes.";
    }
    if (mutationError instanceof TypeError) {
      return "Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.";
    }
    return "Não foi possível concluir a alteração. Tente novamente.";
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompetition || !formValues || isSaving) return;
    const validationErrors = validateCompetitionForm(formValues);
    setFormErrors(validationErrors);
    setFormError("");
    setActionNotice("");
    setHasEditConflict(false);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSaving(true);
    try {
      const path = "api/birds/" + encodeURIComponent(birdId) + "/competitions/" + encodeURIComponent(selectedCompetition.competitionId);
      const updated = await withSessionRecovery(async () => {
        await ensureAntiforgeryToken();
        return client.current!.request<BirdCompetition>(path, {
          body: JSON.stringify({
            name: formValues.name.trim(),
            date: formValues.date || null,
            category: formValues.category.trim() || null,
            placement: formValues.placement ? Number(formValues.placement) : null,
            location: formValues.location.trim() || null,
            notes: formValues.notes.trim() || null
          }),
          headers: { "content-type": "application/json" },
          method: "PUT"
        });
      });
      client.current!.clearCache();
      setSelectedCompetition(updated);
      setIsEditing(false);
      setFormValues(undefined);
      setFormErrors({});
      setFormError("");
      setActionNotice("Competição atualizada com sucesso.");
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 400) {
        const mapped: CompetitionFormErrors = {};
        const fieldMessages: Record<keyof CompetitionFormValues, string> = {
          category: "A categoria pode ter até 200 caracteres.",
          date: "A data não pode ser posterior a hoje.",
          location: "O local pode ter até 200 caracteres.",
          name: "Informe um nome com até 200 caracteres.",
          notes: "As observações podem ter até 2.000 caracteres.",
          placement: "Informe uma colocação com número inteiro positivo."
        };
        for (const key of Object.keys(saveError.fields)) {
          const normalized = key.toLocaleLowerCase("pt-BR") as keyof CompetitionFormValues;
          if (normalized in fieldMessages) mapped[normalized] = fieldMessages[normalized];
        }
        setFormErrors(mapped);
        setFormError("Revise os campos destacados e tente novamente.");
      } else {
        setFormError(mutationErrorMessage(saveError));
        setHasEditConflict(saveError instanceof ApiError && saveError.status === 409);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setIsDeleteDialogOpen(false);
    setDeleteError("");
    setHasDeleteConflict(false);
    deleteButtonRef.current?.focus();
  }

  async function confirmDelete() {
    if (!selectedCompetition || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    setHasDeleteConflict(false);
    try {
      const path = "api/birds/" + encodeURIComponent(birdId) + "/competitions/" + encodeURIComponent(selectedCompetition.competitionId);
      await withSessionRecovery(async () => {
        await ensureAntiforgeryToken();
        return client.current!.request<void>(path, {
          body: JSON.stringify({ confirmed: true }),
          headers: { "content-type": "application/json" },
          method: "DELETE"
        });
      });
      client.current!.clearCache();
      setIsDeleteDialogOpen(false);
      setDeleteComplete(true);
    } catch (removeError) {
      setDeleteError(mutationErrorMessage(removeError));
      setHasDeleteConflict(removeError instanceof ApiError && removeError.status === 409);
    } finally {
      setIsDeleting(false);
    }
  }

  if (status === "loading" || status === "authenticating" || status === "signing-out") {
    return <AppLoadingState activeNav="competitions" email={session?.email} farmName={farmName} label="Preparando competições" message="Consultando o histórico da ave." />;
  }
  if (status === "unauthenticated") {
    return <main className="document-wizard-page competition-history-page"><StateMessage action={<Link className="auth-primary-action" href="/login">Entrar</Link>} heading="Entre para consultar as competições" message="Sua sessão é necessária para visualizar o histórico desta ave." /></main>;
  }
  if (status === "forbidden" || status === "error") {
    return <main className="document-wizard-page competition-history-page"><StateMessage heading="Não foi possível abrir as competições" message="Sua sessão não conseguiu acessar esta área. Tente novamente." retry={() => void refresh()} /></main>;
  }
  if (!session) return null;
  if (farmState === "loading") {
    return <AppLoadingState activeNav="competitions" email={session.email} farmName={farmName} label="Preparando competições" message="Consultando o histórico da ave." />;
  }

  const listHref = `/plantel/aves/${encodeURIComponent(birdId)}/competicoes`;
  const birdHref = `/plantel/aves/${encodeURIComponent(birdId)}`;
  const pageHeading = competitionId ? "Detalhes da competição" : "Histórico de competições";

  return (
    <AuthenticatedShell activeNav="competitions" email={session.email} farmName={farmName}>
      <main className="document-wizard-page competition-history-page">
        <nav aria-label="Navegação estrutural" className="document-wizard-breadcrumb">
          <Link href="/dashboard">Painel</Link><span aria-hidden="true">›</span><Link href="/plantel/aves">Aves</Link><span aria-hidden="true">›</span>
          <Link href={birdHref}>{bird?.name ?? "Ficha da ave"}</Link>{competitionId && <><span aria-hidden="true">›</span><Link href={listHref}>Competições</Link></>}
          <span aria-hidden="true">›</span><span aria-current="page">{competitionId ? "Detalhe" : "Histórico"}</span>
        </nav>
        <header className="document-wizard-header competition-history-header">
          <div><p className="eyebrow">Competições · {farmName}</p><h1>{pageHeading}</h1><p>{bird ? `${bird.name} · ${bird.speciesPopularName} · ${bird.ringNumber ? `Anilha ${bird.ringNumber}` : "Sem anilha"}` : "Consulte os resultados e registros desta ave."}</p></div>
          <div className="document-wizard-header-actions"><Link className="auth-secondary-action" href={birdHref}>Voltar à ficha</Link>{!competitionId && <Link className="auth-primary-action" href={`/competicoes/nova?birdId=${encodeURIComponent(birdId)}`}>Registrar competição</Link>}</div>
        </header>

        {farmState === "blocked" && <StateMessage action={<Link className="auth-primary-action" href="/onboarding/criatorio/selecionar">Selecionar criatório</Link>} heading="Selecione um criatório" headingLevel="h2" message={error || "Escolha um criatório para consultar o histórico."} />}
        {farmState === "error" && <StateMessage heading={competitionId ? "Não foi possível consultar a competição" : "Não foi possível consultar o histórico"} headingLevel="h2" message={error} retry={() => void load()} />}
        {farmState === "ready" && competitionId && deleteComplete && <StateMessage action={<Link className="auth-primary-action" href={listHref}>Voltar ao histórico</Link>} heading="Competição excluída" headingLevel="h2" message="O registro foi removido do histórico desta ave." />}
        {farmState === "ready" && competitionId && selectedCompetition && !deleteComplete && <article aria-labelledby="competition-detail-title" className="document-wizard-card competition-history-detail">
          <div className="competition-history-detail-heading"><span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="trophy" /></span><div><p className="eyebrow">Resultado registrado</p><h2 id="competition-detail-title">{selectedCompetition.name}</h2><p>{formatDate(selectedCompetition.date)}</p></div></div>
          {actionNotice && <p className="competition-action-notice" role="status">{actionNotice}</p>}
          {!isEditing && <dl className="competition-history-fields">
            <div><dt>Categoria</dt><dd>{selectedCompetition.category || "Não informada"}</dd></div>
            <div><dt>Colocação</dt><dd>{selectedCompetition.placement ? `${selectedCompetition.placement}º lugar` : "Não informada"}</dd></div>
            <div><dt>Local</dt><dd>{selectedCompetition.location || "Não informado"}</dd></div>
            <div><dt>Última atualização</dt><dd>{formatDate(selectedCompetition.updatedAtUtc)}</dd></div>
            <div className="competition-history-notes"><dt>Observações</dt><dd>{selectedCompetition.notes || "Nenhuma observação registrada."}</dd></div>
          </dl>}
          {isEditing && formValues ? (
            <form className="competition-edit-form" onSubmit={submitEdit}>
              <div className="competition-fields-grid">
                <label className="competition-field competition-field-wide" htmlFor="edit-competition-name">
                  <span>Nome da competição <b aria-hidden="true">*</b></span>
                  <input autoComplete="off" disabled={isSaving} id="edit-competition-name" maxLength={200} value={formValues.name} aria-invalid={Boolean(formErrors.name)} aria-describedby={formErrors.name ? "edit-competition-name-error" : undefined} onChange={(event) => changeFormValue("name", event.target.value)} />
                  {formErrors.name && <small className="competition-field-error" id="edit-competition-name-error">{formErrors.name}</small>}
                </label>
                <label className="competition-field" htmlFor="edit-competition-date">
                  <span>Data <em>opcional</em></span>
                  <input disabled={isSaving} id="edit-competition-date" max={new Date().toISOString().slice(0, 10)} type="date" value={formValues.date} aria-invalid={Boolean(formErrors.date)} aria-describedby={formErrors.date ? "edit-competition-date-error" : undefined} onChange={(event) => changeFormValue("date", event.target.value)} />
                  {formErrors.date && <small className="competition-field-error" id="edit-competition-date-error">{formErrors.date}</small>}
                </label>
                <label className="competition-field" htmlFor="edit-competition-category">
                  <span>Categoria <em>opcional</em></span>
                  <input disabled={isSaving} id="edit-competition-category" maxLength={200} value={formValues.category} aria-invalid={Boolean(formErrors.category)} aria-describedby={formErrors.category ? "edit-competition-category-error" : undefined} onChange={(event) => changeFormValue("category", event.target.value)} />
                  {formErrors.category && <small className="competition-field-error" id="edit-competition-category-error">{formErrors.category}</small>}
                </label>
                <label className="competition-field" htmlFor="edit-competition-placement">
                  <span>Colocação <em>opcional</em></span>
                  <input disabled={isSaving} id="edit-competition-placement" min="1" step="1" type="number" value={formValues.placement} aria-invalid={Boolean(formErrors.placement)} aria-describedby={formErrors.placement ? "edit-competition-placement-error" : undefined} onChange={(event) => changeFormValue("placement", event.target.value)} />
                  {formErrors.placement && <small className="competition-field-error" id="edit-competition-placement-error">{formErrors.placement}</small>}
                </label>
                <label className="competition-field" htmlFor="edit-competition-location">
                  <span>Local <em>opcional</em></span>
                  <input disabled={isSaving} id="edit-competition-location" maxLength={200} value={formValues.location} aria-invalid={Boolean(formErrors.location)} aria-describedby={formErrors.location ? "edit-competition-location-error" : undefined} onChange={(event) => changeFormValue("location", event.target.value)} />
                  {formErrors.location && <small className="competition-field-error" id="edit-competition-location-error">{formErrors.location}</small>}
                </label>
                <label className="competition-field competition-field-wide" htmlFor="edit-competition-notes">
                  <span>Observações <em>opcionais</em></span>
                  <textarea disabled={isSaving} id="edit-competition-notes" maxLength={2000} value={formValues.notes} aria-invalid={Boolean(formErrors.notes)} aria-describedby={formErrors.notes ? "edit-competition-notes-error" : undefined} onChange={(event) => changeFormValue("notes", event.target.value)} />
                  <small className="competition-character-count">{formValues.notes.length}/2000</small>
                  {formErrors.notes && <small className="competition-field-error" id="edit-competition-notes-error">{formErrors.notes}</small>}
                </label>
              </div>
              {formError && <p className="competition-action-error" role="alert">{formError}</p>}
              {hasEditConflict && <button className="auth-secondary-action" onClick={() => { client.current!.clearCache(); stopEditing(); void load(); }} type="button">Carregar dados atualizados</button>}
              <div className="competition-management-actions">
                <button className="auth-secondary-action" disabled={isSaving} onClick={stopEditing} type="button">Cancelar</button>
                <button className="auth-primary-action" disabled={isSaving} type="submit">{isSaving ? "Salvando..." : "Salvar alterações"}</button>
              </div>
            </form>
          ) : (
            <div className="competition-management-actions">
              <button className="auth-secondary-action" onClick={startEditing} ref={editButtonRef} type="button">Editar</button>
              <button className="competition-danger-action" onClick={() => { setDeleteError(""); setHasDeleteConflict(false); setIsDeleteDialogOpen(true); }} ref={deleteButtonRef} type="button">Excluir</button>
              <Link className="auth-secondary-action" href={listHref}>Voltar ao histórico</Link>
            </div>
          )}
        </article>}
        {farmState === "ready" && !competitionId && items.length === 0 && <StateMessage action={<Link className="auth-primary-action" href={`/competicoes/nova?birdId=${encodeURIComponent(birdId)}`}>Registrar primeira competição</Link>} heading="Nenhuma competição registrada" headingLevel="h2" message="Os resultados e participações desta ave aparecerão aqui." />}
        {farmState === "ready" && !competitionId && items.length > 0 && <section aria-labelledby="competition-history-list-title" className="document-wizard-card competition-history-results">
          <div className="document-history-results-heading"><div><p className="eyebrow">{items.length} {items.length === 1 ? "registro" : "registros"}</p><h2 id="competition-history-list-title">Competições de {bird?.name}</h2><p>Histórico em ordem da participação mais recente.</p></div></div>
          <ul aria-label="Competições registradas" className="document-history-list competition-history-list">
            {items.map((item) => <li key={item.competitionId}><Link className="document-history-item competition-history-item" href={`${listHref}/${encodeURIComponent(item.competitionId)}`}>
              <span aria-hidden="true" className="document-history-item-icon"><DashboardIcon name="trophy" /></span>
              <span className="document-history-item-main"><span className="document-history-item-title"><strong>{item.name}</strong>{item.placement && <span className="competition-placement-badge">{item.placement}º lugar</span>}</span>
                <small>{formatDate(item.date)}{item.category ? ` · ${item.category}` : ""}</small>{item.location && <small>{item.location}</small>}</span>
              <span className="document-history-item-actions"><span className="auth-secondary-action">Ver detalhes <span aria-hidden="true">›</span></span></span>
            </Link></li>)}
          </ul>
        </section>}
        {isDeleteDialogOpen && <div className="competition-delete-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeDeleteDialog(); }}>
          <section aria-describedby="competition-delete-description" aria-labelledby="competition-delete-title" aria-modal="true" className="competition-delete-dialog" onKeyDown={(event) => {
            if (event.key === "Escape") {
              closeDeleteDialog();
              return;
            }
            if (event.key === "Tab") {
              const focusable = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
              if (focusable.length === 0) return;
              const first = focusable.item(0);
              const last = focusable.item(focusable.length - 1);
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }
          }} role="alertdialog" tabIndex={-1}>
            <span aria-hidden="true" className="competition-delete-icon"><DashboardIcon name="trash" /></span>
            <h2 id="competition-delete-title">Excluir competição?</h2>
            <p id="competition-delete-description">O registro “{selectedCompetition?.name}” será removido do histórico desta ave. Esta ação não pode ser desfeita.</p>
            {deleteError && <p className="competition-action-error" role="alert">{deleteError}</p>}
            {hasDeleteConflict && <button className="auth-secondary-action" disabled={isDeleting} onClick={() => { setIsDeleteDialogOpen(false); client.current!.clearCache(); void load(); }} type="button">Carregar dados atualizados</button>}
            <div className="competition-delete-actions">
              <button autoFocus className="auth-secondary-action" disabled={isDeleting} onClick={closeDeleteDialog} ref={cancelDeleteButtonRef} type="button">Cancelar</button>
              <button className="competition-danger-action" disabled={isDeleting} onClick={() => void confirmDelete()} type="button">{isDeleting ? "Excluindo..." : "Excluir competição"}</button>
            </div>
          </section>
        </div>}
      </main>
    </AuthenticatedShell>
  );
}
