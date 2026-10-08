import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useState } from "react";

import { AdminApiError } from "@/admin-client/api-client";
import { createArea, buildPayload, deleteAreaRecord, displayFieldValue, formInitialValue, loadArea, setAreaEnabled, updateArea } from "@/admin-client/operations";
import { ADMIN_AREAS, ADMIN_AREA_BY_ID, areaTitle, type AdminArea, type AdminAreaId, type AdminField, type AdminRelation, type AdminRow } from "@/admin-client/resources";
import type { TuiSession } from "@/tui/auth";

interface Page {
  areaId?: AdminAreaId;
  filter?: { field: string; value: string };
  selectedId?: string;
}

interface FormState {
  area: AdminArea;
  mode: "create" | "edit";
  record?: AdminRow;
  fields: readonly AdminField[];
  values: Record<string, string>;
  options: Record<string, AdminRow[]>;
  index: number;
  error?: string;
}

interface ConfirmState {
  action: "delete" | "revoke";
  area: AdminArea;
  row: AdminRow;
}

interface SavePreview {
  form: FormState;
  payload: Record<string, unknown>;
}

interface HomeSummary {
  applications: number;
  providers: number;
  routes: number;
}

function fit(value: unknown, width: number): string {
  const text = displayFieldValue(value).replace(/[\r\n\t]/gu, " ");
  const chars = Array.from(text);
  return chars.length > width ? `${chars.slice(0, Math.max(0, width - 1)).join("")}…` : text;
}

function isSensitiveField(key: string): boolean {
  return /secret|token|password|hash|api.?key/iu.test(key);
}

function fieldValue(field: AdminField, form: FormState): string {
  const value = form.values[field.key] ?? "";
  if (field.kind === "secret") return value ? "•".repeat(Math.min(Array.from(value).length, 24)) : "";
  if (field.kind === "boolean") return value === "true" ? "Sí" : "No";
  if (field.kind === "choice") {
    if (field.relation) {
      const row = form.options[field.key]?.find((item) => item.id === value);
      return row ? areaTitle(ADMIN_AREA_BY_ID[field.relation], row) : value;
    }
    return value;
  }
  return value;
}

function getChoices(field: AdminField, form: FormState): Array<{ value: string; label: string }> {
  if (field.relation) {
    const area = ADMIN_AREA_BY_ID[field.relation];
    return (form.options[field.key] ?? []).map((row) => ({ value: row.id, label: areaTitle(area, row) }));
  }
  return (field.choices ?? []).map((value) => ({ value, label: value }));
}

function listWindow<T>(items: T[], index: number, count: number): T[] {
  if (items.length <= count) return items;
  const start = Math.max(0, Math.min(items.length - count, index - Math.floor(count / 2)));
  return items.slice(start, start + count);
}

export function AdminTui({ session }: { session: TuiSession }) {
  const { exit } = useApp();
  const { columns = 80, rows = 24 } = useWindowSize();
  const [history, setHistory] = useState<Page[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const page = history[historyIndex] ?? {};
  const area = page.areaId ? ADMIN_AREA_BY_ID[page.areaId] : undefined;
  const [records, setRecords] = useState<AdminRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [form, setForm] = useState<FormState>();
  const [relationPicker, setRelationPicker] = useState(false);
  const [relationIndex, setRelationIndex] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState>();
  const [savePreview, setSavePreview] = useState<SavePreview>();
  const [summary, setSummary] = useState<HomeSummary | null>();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState("");
  const [expanded, setExpanded] = useState(false);

  const pageKey = JSON.stringify(page);
  useEffect(() => {
    let active = true;
    if (!area) {
      setRecords([]);
      setSelectedIndex(0);
      setSummary(undefined);
      void Promise.all([
        loadArea(session.api, ADMIN_AREA_BY_ID.applications),
        loadArea(session.api, ADMIN_AREA_BY_ID.providers),
        loadArea(session.api, ADMIN_AREA_BY_ID.routes),
      ]).then(([applications, providers, routes]) => {
        if (active) setSummary({ applications: applications.length, providers: providers.length, routes: routes.length });
      }).catch(() => {
        if (active) setSummary(null);
      });
      return () => { active = false; };
    }
    setBusy(true);
    setError("");
    void loadArea(session.api, area).then((all) => {
      if (!active) return;
      const filtered = page.filter ? all.filter((record) => record[page.filter!.field] === page.filter!.value) : all;
      setRecords(filtered);
      const selected = page.selectedId ? filtered.findIndex((record) => record.id === page.selectedId) : -1;
      setSelectedIndex(selected >= 0 ? selected : 0);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "No se pudieron cargar los registros");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [area, page.filter?.field, page.filter?.value, pageKey, refreshKey, session.api]);

  const selectedRecord = records[selectedIndex];
  const selectedAreaIndex = area ? ADMIN_AREAS.findIndex((item) => item.id === area.id) : 0;
  const visibleRecords = useMemo(() => listWindow(records, selectedIndex, Math.max(4, Math.min(12, rows - 13))), [records, rows, selectedIndex]);
  const relations = area?.relations ?? [];

  function rememberSelection() {
    if (!area || !selectedRecord) return;
    const next = [...history];
    if (next[historyIndex]) next[historyIndex] = { ...next[historyIndex], selectedId: selectedRecord.id };
    setHistory(next);
  }

  function navigate(next: Page) {
    const base = history.slice(0, historyIndex + 1);
    if (area && selectedRecord && base.length) {
      base[base.length - 1] = { ...base[base.length - 1], selectedId: selectedRecord.id };
    }
    setHistory([...base, next]);
    setHistoryIndex(base.length);
    setSelectedIndex(0);
    setExpanded(false);
    setRelationPicker(false);
    setNotice("");
    setError("");
  }

  function back() {
    if (historyIndex > 0) {
      rememberSelection();
      setHistoryIndex((index) => index - 1);
      setRelationPicker(false);
      setExpanded(false);
      setNotice("");
      setError("");
    } else {
      exit();
    }
  }

  function forward() {
    if (historyIndex < history.length - 1) {
      rememberSelection();
      setHistoryIndex((index) => Math.min(history.length - 1, index + 1));
      setRelationPicker(false);
      setExpanded(false);
    }
  }

  async function beginForm(target: AdminArea, mode: "create" | "edit", record?: AdminRow) {
    const fields = mode === "edit" ? target.editFields : target.fields;
    if (!fields?.length) return;
    setBusy(true);
    setError("");
    try {
      const options: Record<string, AdminRow[]> = {};
      for (const field of fields) {
        if (!field.relation) continue;
        const relatedArea = ADMIN_AREA_BY_ID[field.relation];
        const relatedRows = await loadArea(session.api, relatedArea);
        options[field.key] = relatedRows.filter((row) => row.enabled !== false || row.id === record?.[field.key]);
        if (!options[field.key].length && !field.optional) {
          throw new Error(`No hay ${relatedArea.label.toLowerCase()} disponibles. Créala primero.`);
        }
      }
      setForm({
        area: target,
        mode,
        record,
        fields,
        values: Object.fromEntries(fields.map((field) => [field.key, formInitialValue(field, record)])),
        options,
        index: 0,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron preparar los campos");
    } finally {
      setBusy(false);
    }
  }

  async function writeForm(current: FormState, payload: Record<string, unknown>) {
    const result = current.mode === "edit" && current.record
      ? await updateArea(session.api, current.area, current.record.id, payload)
      : await createArea(session.api, current.area, payload);
    if ("key" in result && typeof result.key === "string") setOneTimeKey(result.key);
    const data = result.data as { imported?: number } | undefined;
    setNotice(current.area.import
      ? `Importación completada: ${data?.imported ?? 0} rutas.`
      : current.mode === "edit" ? "Cambios guardados." : "Registro creado.");
    setForm(undefined);
    setRefreshKey((value) => value + 1);
  }

  async function saveForm(current: FormState) {
    try {
      setBusy(true);
      setError("");
      const payload = buildPayload(current.fields, current.values);
      if (current.area.id === "credentials") {
        if (payload.owner_type === "shared") delete payload.consumer_application_id;
        if (payload.owner_type === "application" && !payload.consumer_application_id) {
          throw new Error("Selecciona la aplicación propietaria de la credencial");
        }
      }
      if (current.mode === "edit") {
        const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(current.record?.[key]),
        ));
        if (!Object.keys(changes).length) {
          setForm(undefined);
          setNotice("No hay cambios para guardar.");
          return;
        }
        setForm(undefined);
        setSavePreview({ form: current, payload: changes });
        return;
      }
      await writeForm(current, payload);
    } catch (caught) {
      setForm({ ...current, error: caught instanceof Error ? caught.message : "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  }

  async function applySavePreview(preview: SavePreview) {
    try {
      setBusy(true);
      setError("");
      await writeForm(preview.form, preview.payload);
      setSavePreview(undefined);
    } catch (caught) {
      setSavePreview(undefined);
      setForm({ ...preview.form, error: caught instanceof Error ? caught.message : "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleSelected() {
    if (!area || !selectedRecord) return;
    setBusy(true);
    setError("");
    try {
      await setAreaEnabled(session.api, area, selectedRecord);
      setNotice(selectedRecord.enabled === false ? "Registro activado." : "Registro desactivado.");
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el estado");
    } finally {
      setBusy(false);
    }
  }

  async function removeConfirmed() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await deleteAreaRecord(session.api, confirm.area, confirm.row.id);
      setNotice(confirm.action === "revoke" ? "Clave revocada permanentemente." : "Registro eliminado.");
      setConfirm(undefined);
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof AdminApiError ? caught.message : caught instanceof Error ? caught.message : "No se pudo eliminar");
      setConfirm(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function followRelation(relation: AdminRelation) {
    if (!area || !selectedRecord) return;
    const sourceId = selectedRecord[relation.field];
    if (typeof sourceId !== "string") {
      setNotice("Este registro no tiene una relación disponible.");
      return;
    }
    const targetArea = ADMIN_AREA_BY_ID[relation.area];
    try {
      setBusy(true);
      const targets = await loadArea(session.api, targetArea);
      const filter = { field: relation.matchField, value: sourceId };
      const matches = targets.filter((row) => row[filter.field] === filter.value);
      if (!matches.length) {
        setNotice(`Sin registros relacionados: ${relation.label}.`);
        setRelationPicker(false);
        return;
      }
      navigate({ areaId: relation.area, filter, selectedId: matches[0].id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo abrir la relación");
    } finally {
      setBusy(false);
    }
  }

  function changeFormValue(current: FormState, update: (value: string) => string) {
    const field = current.fields[current.index];
    if (!field) return;
    setForm({ ...current, values: { ...current.values, [field.key]: update(current.values[field.key] ?? "") }, error: undefined });
  }

  useInput((input, key) => {
    if (oneTimeKey) {
      setOneTimeKey("");
      setNotice("La clave ya no se mostrará. Guárdala en un lugar seguro.");
      return;
    }
    if (busy) return;
    if (form) {
      const field = form.fields[form.index];
      if (!field) return;
      if (key.escape) {
        setForm(undefined);
        setNotice("Formulario cancelado.");
        return;
      }
      if (key.ctrl && input.toLowerCase() === "u") {
        changeFormValue(form, () => "");
        return;
      }
      if (key.ctrl && input.toLowerCase() === "s") {
        void saveForm(form);
        return;
      }
      if (field.kind === "choice" || field.kind === "boolean") {
        const choices = field.kind === "boolean"
          ? [{ value: "false", label: "No" }, { value: "true", label: "Sí" }]
          : getChoices(field, form);
        if (key.upArrow || key.downArrow) {
          const currentValue = form.values[field.key] ?? choices[0]?.value ?? "";
          const currentIndex = Math.max(0, choices.findIndex((item) => item.value === currentValue));
          const nextIndex = (currentIndex + (key.downArrow ? 1 : choices.length - 1)) % Math.max(1, choices.length);
          changeFormValue(form, () => choices[nextIndex]?.value ?? "");
          return;
        }
        if (key.return || key.rightArrow) {
          if (form.index + 1 < form.fields.length) setForm({ ...form, index: form.index + 1 });
          else void saveForm(form);
          return;
        }
        if (key.leftArrow && form.index > 0) setForm({ ...form, index: form.index - 1 });
        return;
      }
      if (key.leftArrow && form.index > 0) {
        setForm({ ...form, index: form.index - 1 });
        return;
      }
      if (key.rightArrow) {
        if (form.index + 1 < form.fields.length) setForm({ ...form, index: form.index + 1 });
        else void saveForm(form);
        return;
      }
      if (key.backspace || key.delete) {
        changeFormValue(form, (value) => Array.from(value).slice(0, -1).join(""));
        return;
      }
      if (key.return) {
        if (field.kind === "multiline") {
          changeFormValue(form, (value) => `${value}\n`);
        } else if (form.index + 1 < form.fields.length) {
          setForm({ ...form, index: form.index + 1 });
        } else {
          void saveForm(form);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const addition = field.kind === "multiline" ? input : input.replace(/[\r\n]/gu, "");
        if (addition) changeFormValue(form, (value) => `${value}${addition}`);
      }
      return;
    }
    if (savePreview) {
      if (input.toLowerCase() === "y" || key.return) void applySavePreview(savePreview);
      else if (input.toLowerCase() === "n" || key.escape) {
        setSavePreview(undefined);
        setForm(savePreview.form);
        setNotice("Cambios sin aplicar; puedes seguir editando.");
      }
      return;
    }
    if (confirm) {
      if (input.toLowerCase() === "y" || key.return) void removeConfirmed();
      else if (input.toLowerCase() === "n" || key.escape) setConfirm(undefined);
      return;
    }
    if (help) {
      if (key.escape || key.return || input === "?") setHelp(false);
      return;
    }
    if (relationPicker) {
      if (key.escape) setRelationPicker(false);
      else if (key.upArrow) setRelationIndex((value) => Math.max(0, value - 1));
      else if (key.downArrow) setRelationIndex((value) => Math.min(relations.length - 1, value + 1));
      else if (key.return && relations[relationIndex]) void followRelation(relations[relationIndex]);
      return;
    }
    if (input === "?" || (key as typeof key & { f1?: boolean }).f1) {
      setHelp(true);
      return;
    }
    if (key.leftArrow || input === "h" || key.escape) {
      back();
      return;
    }
    if (key.rightArrow || input === "l") {
      forward();
      return;
    }
    if (!area) {
      if (key.upArrow) setSelectedIndex((value) => Math.max(0, value - 1));
      else if (key.downArrow) setSelectedIndex((value) => Math.min(ADMIN_AREAS.length - 1, value + 1));
      else if (key.return) navigate({ areaId: ADMIN_AREAS[selectedIndex]?.id });
      else if (input.toLowerCase() === "q") exit();
      return;
    }
    if (key.upArrow) setSelectedIndex((value) => Math.max(0, value - 1));
    else if (key.downArrow) setSelectedIndex((value) => Math.min(records.length - 1, value + 1));
    else if (input.toLowerCase() === "a") navigate({});
    else if (key.tab) navigate({ areaId: ADMIN_AREAS[(selectedAreaIndex + 1) % ADMIN_AREAS.length]?.id });
    else if (input.toLowerCase() === "r" && relations.length) {
      setRelationIndex(0);
      setRelationPicker(true);
    } else if (input.toLowerCase() === "c" && area.fields?.length && !area.readOnly) void beginForm(area, "create");
    else if (input.toLowerCase() === "e" && area.editFields?.length && selectedRecord) void beginForm(area, "edit", selectedRecord);
    else if (input.toLowerCase() === "t" && selectedRecord && typeof selectedRecord.enabled === "boolean") void toggleSelected();
    else if ((input.toLowerCase() === "d" || input.toLowerCase() === "v") && selectedRecord) {
      const revoke = input.toLowerCase() === "v";
      const allowed = revoke
        ? area.revoke && !selectedRecord.revoked_at
        : area.delete;
      if (allowed) setConfirm({ action: revoke ? "revoke" : "delete", area, row: selectedRecord });
    } else if (key.return && selectedRecord) setExpanded((value) => !value);
    else if (input.toLowerCase() === "q") exit();
  });

  const selectedArea = area ?? ADMIN_AREAS[selectedIndex];
  const narrow = columns < 104;
  const panelHeight = Math.max(4, Math.min(11, rows - 14));
  const breadcrumb = history.slice(0, historyIndex + 1)
    .flatMap((item) => item.areaId ? [ADMIN_AREA_BY_ID[item.areaId].label] : []);
  const location = `Inicio${breadcrumb.length ? ` / ${breadcrumb.join(" / ")}` : ""}${area ? ` · ${records.length} registros` : ""}`;
  const visibleFormFields = form
    ? listWindow([...form.fields], form.index, Math.max(1, Math.min(6, rows - 12)))
    : [];

  return (
    <Box flexDirection="column" width={columns}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">GATEWAY · ADMINISTRACIÓN LOCAL</Text>
        <Text dimColor>Sesión hasta {new Date(session.expiresAt).toLocaleTimeString()}</Text>
      </Box>
      <Text dimColor>{fit(location, Math.max(20, columns - 4))}</Text>
      <Box flexDirection="row" flexGrow={1} marginTop={1}>
        {!narrow && (
          <Box flexDirection="column" width={27} borderStyle="single" paddingX={1}>
            <Text bold>ÁREAS</Text>
            {ADMIN_AREAS.map((item) => (
              <Text key={item.id} color={selectedArea?.id === item.id ? "cyan" : undefined} bold={selectedArea?.id === item.id}>
                {selectedArea?.id === item.id ? "› " : "  "}{fit(item.label, 23)}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection={narrow ? "column" : "row"} flexGrow={1}>
          {form ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
              <Text bold color="cyan">{form.mode === "edit" ? "EDITAR" : "CREAR"} · {form.area.label}</Text>
              <Text dimColor>Campo {form.index + 1}/{form.fields.length} · ← anterior · →/Enter siguiente · Ctrl+S guardar · Esc cancelar</Text>
              {visibleFormFields.map((item) => {
                const index = form.fields.indexOf(item);
                const active = index === form.index;
                const value = fieldValue(item, form);
                const visible = item.kind === "multiline" ? value.split("\n").slice(-Math.max(2, panelHeight - 5)).join("\n") : fit(value || "—", Math.max(10, columns - 18));
                return (
                  <Box key={item.key} flexDirection="column" marginTop={index === 0 ? 1 : 0}>
                    <Text color={active ? "cyan" : undefined} bold={active}>{active ? "› " : "  "}{item.label}{item.optional ? " (opcional)" : ""}</Text>
                    {item.kind === "choice" && active ? (
                      <Text>   {getChoices(item, form).map((option) => option.value === form.values[item.key] ? `[${option.label}]` : option.label).join("  ") || "Sin opciones disponibles"}</Text>
                    ) : item.kind === "boolean" && active ? (
                      <Text>   {form.values[item.key] === "true" ? "[Sí]  No" : "Sí  [No]"} · ↑↓ cambiar</Text>
                    ) : <Text>   {active && item.kind !== "secret" && item.kind !== "multiline" ? `${visible}▏` : visible}</Text>}
                  </Box>
                );
              })}
              {form.error && <Text color="red">{form.error}</Text>}
            </Box>
          ) : savePreview ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="yellow" paddingX={1}>
              <Text bold color="yellow">REVISAR CAMBIOS · {areaTitle(savePreview.form.area, savePreview.form.record)}</Text>
              {Object.entries(savePreview.payload).filter(([key]) => !isSensitiveField(key)).map(([key, value]) => (
                <Text key={key}>{savePreview.form.fields.find((field) => field.key === key)?.label ?? key}: {displayFieldValue(value)}</Text>
              ))}
              <Text>¿Aplicar estos cambios? y confirma · n/Esc vuelve al formulario</Text>
            </Box>
          ) : oneTimeKey ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor="yellow" paddingX={1}>
              <Text bold color="yellow">CLAVE COMPLETA · SE MUESTRA UNA SOLA VEZ</Text>
              <Text>{oneTimeKey}</Text>
              <Text dimColor>Cópiala ahora y guárdala de forma segura. Pulsa cualquier tecla para ocultarla.</Text>
            </Box>
          ) : confirm ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="yellow" paddingX={1}>
              <Text bold color="yellow">Confirmar {confirm.action === "revoke" ? "revocación permanente" : "eliminación"}</Text>
              <Text>{areaTitle(confirm.area, confirm.row)}</Text>
              <Text>¿Continuar? y confirma · n/Esc cancela</Text>
            </Box>
          ) : help ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
              <Text bold color="cyan">AYUDA DE TECLADO</Text>
              <Text>↑/↓ mover selección · Enter abrir detalle o confirmar</Text>
              <Text>c crear · e editar · t activar/desactivar · d eliminar · v revocar clave</Text>
              <Text>r abrir relaciones · Tab siguiente área · a volver a áreas</Text>
              <Text>←/h atrás · →/l avanzar historial · ?/F1 ayuda · q salir</Text>
              <Text>En formularios: ←/→ cambiar campo · Ctrl+U vaciar · Ctrl+S guardar · Esc cancelar</Text>
              <Text>Pulsa Enter, ? o Esc para cerrar.</Text>
            </Box>
          ) : relationPicker ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
              <Text bold color="cyan">RELACIONES · {area?.label}</Text>
              {relations.map((item, index) => (
                <Text key={`${item.area}-${item.label}`} color={index === relationIndex ? "cyan" : undefined}>
                  {index === relationIndex ? "› " : "  "}{item.label} → {ADMIN_AREA_BY_ID[item.area].label}
                </Text>
              ))}
              <Text dimColor>↑/↓ elegir · Enter abrir · Esc cancelar</Text>
            </Box>
          ) : !area ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
              <Text bold color="cyan">ADMINISTRACIÓN</Text>
              <Text bold color={summary === null ? "red" : "green"}>
                Backend: {summary === undefined ? "consultando…" : summary === null ? "sin respuesta administrativa" : `conectado · aplicaciones ${summary.applications} · proveedores ${summary.providers} · rutas ${summary.routes}`}
              </Text>
              <Text>Diez áreas, una sesión local y acceso directo a los registros relacionados.</Text>
              <Text>Usa ↑/↓ y Enter para abrir un área. Tab cambia de área desde una lista.</Text>
              <Text dimColor>El backend debe estar activo en loopback. Los secretos nunca aparecen en listados.</Text>
            </Box>
          ) : (
            <>
              <Box flexDirection="column" width={narrow ? columns : Math.max(30, Math.floor(columns * 0.36))} height={panelHeight} borderStyle="single" paddingX={1}>
                <Text bold>REGISTROS{busy ? " · cargando…" : ""}</Text>
                {records.length === 0 && <Text dimColor>{error ? "No se pudieron cargar." : "Sin registros. Pulsa c para crear."}</Text>}
                {visibleRecords.map((record) => {
                  const index = records.indexOf(record);
                  const title = areaTitle(area, record);
                  const state = typeof record.enabled === "boolean" ? (record.enabled ? " [ACTIVO]" : " [INACTIVO]") : "";
                  return (
                    <Text key={record.id} color={index === selectedIndex ? "cyan" : undefined} bold={index === selectedIndex}>
                      {index === selectedIndex ? "› " : "  "}{fit(`${title}${state}`, Math.max(10, (narrow ? columns : Math.floor(columns * 0.36)) - 7))}
                    </Text>
                  );
                })}
              </Box>
              <Box flexDirection="column" flexGrow={1} height={panelHeight} borderStyle="single" paddingX={1}>
                <Text bold>DETALLE</Text>
                {!selectedRecord ? <Text dimColor>Selecciona un registro.</Text> : (
                  <>
                    {(expanded ? Object.entries(selectedRecord) : area.columns.map((key) => [key, selectedRecord[key]] as [string, unknown]))
                      .filter(([key]) => !isSensitiveField(key))
                      .slice(0, Math.max(3, panelHeight - 4))
                      .map(([key, value]) => <Text key={key}>{fit(`${key}: ${displayFieldValue(value)}`, Math.max(10, columns - 14))}</Text>)}
                    {relations.length > 0 && <Text dimColor>Relaciones disponibles: {relations.map((item) => item.label).join(" · ")} (r)</Text>}
                    {expanded && <Text dimColor>Enter contrae el detalle.</Text>}
                  </>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>
      {error && !form?.error && <Text color="red">Error: {error}</Text>}
      {notice && <Text color="green">{notice}</Text>}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>{form ? "←/→ campo · Enter siguiente · Ctrl+S guardar · Esc cancelar" : narrow ? "↑↓ mover · c crear · e editar · t estado · d/v quitar · r relaciones · ? ayuda · Esc atrás" : "↑↓ mover · Enter detalle · c crear · e editar · t activar/desactivar · d eliminar · v revocar · r relaciones · ? ayuda"}</Text>
      </Box>
    </Box>
  );
}

export async function startAdminTui(session: TuiSession): Promise<void> {
  const { render } = await import("ink");
  await render(<AdminTui session={session} />, { alternateScreen: true, exitOnCtrlC: true }).waitUntilExit();
}
