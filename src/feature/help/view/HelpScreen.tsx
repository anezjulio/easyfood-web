import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import {
  helpSections,
  type HelpAudience,
  type HelpMenuGroup,
  type HelpSection,
} from "../model/help.content";
import styles from "./HelpScreen.module.css";

const GROUP_ORDER: HelpMenuGroup[] = ["Operaciones", "Productos", "Administrativo"];

const GROUP_DESCRIPTION: Record<HelpMenuGroup, string> = {
  Operaciones: "Tareas del dia a dia para vender, abrir caja y registrar movimientos simples.",
  Productos: "Pantallas para cargar mercancia, recibir pedidos y trabajar con el catalogo.",
  Administrativo: "Pantallas de control, configuracion y revision para personas administradoras.",
};

const AUDIENCE_LABEL: Record<HelpAudience, string> = {
  all: "Todos",
  operator: "Operador",
  admin: "Admin",
};

type HelpTutorial = {
  section: HelpSection;
  action: HelpSection["actions"][number];
};

export default function HelpScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const visibleSections = useMemo(() => getVisibleSections(isAdmin), [isAdmin]);
  const groupedSections = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        sections: visibleSections.filter((section) => section.menuGroup === group),
      })).filter((group) => group.sections.length > 0),
    [visibleSections],
  );
  const tutorials: HelpTutorial[] = useMemo(
    () =>
      visibleSections.reduce<HelpTutorial[]>((items, section) => {
        for (const action of section.actions) {
          items.push({ section, action });
        }
        return items;
      }, []),
    [visibleSections],
  );
  const [selectedActionId, setSelectedActionId] = useState<string | null>(() => resolveSelectedActionId(visibleSections, tutorials, null));
  const resolvedSelectedActionId = resolveSelectedActionId(visibleSections, tutorials, selectedActionId);

  const selectedTutorial = tutorials.find((tutorial) => tutorial.action.id === resolvedSelectedActionId) ?? tutorials[0] ?? null;

  function handleSelectTutorial(actionId: string) {
    setSelectedActionId(actionId);

    if (typeof window === "undefined") {
      return;
    }

    const nextHash = `#${actionId}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }

    if (window.matchMedia("(max-width: 980px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("help-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ayuda" }]} asTitle />
            <p className={styles.subtitle}>Indice rapido y tutoriales cortos para usar cada pantalla sin dar vueltas.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.helpLayout}>
          <aside className={styles.sidebar}>
            <section className={styles.sidebarIntro}>
              <div className={styles.indexHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Indice</p>
                  <h2 className={styles.indexTitle}>Operacion y suboperacion</h2>
                  <p className={styles.sidebarText}>
                    Selecciona cualquier tutorial del indice y lo veras a la derecha sin recorrer toda la pagina.
                  </p>
                </div>
                <div className={styles.indexSummary}>
                  <span className={styles.summaryBadge}>{visibleSections.length} pantallas</span>
                  <span className={styles.summaryBadge}>{tutorials.length} tutoriales</span>
                </div>
              </div>
            </section>

            <div className={styles.sidebarGroups}>
              {groupedSections.map(({ group, sections }) => (
                <section key={group} className={styles.navGroup}>
                  <div className={styles.groupHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Grupo</p>
                      <h3 className={styles.groupTitle}>{group}</h3>
                      <p className={styles.groupDescription}>{GROUP_DESCRIPTION[group]}</p>
                    </div>
                    <span className={styles.groupCount}>{sections.length}</span>
                  </div>

                  <div className={styles.navSectionList}>
                    {sections.map((section) => {
                      const isSectionActive = selectedTutorial?.section.id === section.id;
                      const firstActionId = section.actions[0]?.id;

                      return (
                        <article
                          key={section.id}
                          className={`${styles.navSection} ${isSectionActive ? styles.navSectionActive : ""}`.trim()}
                        >
                          <button
                            type="button"
                            className={styles.navSectionButton}
                            onClick={() => {
                              if (firstActionId) {
                                handleSelectTutorial(firstActionId);
                              }
                            }}
                            aria-pressed={isSectionActive}
                          >
                            <span className={styles.navSectionButtonMain}>
                              <span className={styles.navSectionTitle}>{section.menuButton}</span>
                              <span className={styles.navSectionMeta}>{section.screenTitle}</span>
                            </span>
                            <span className={styles.navSectionCount}>{section.actions.length}</span>
                          </button>

                          <div className={styles.navActionList}>
                            {section.actions.map((action) => {
                              const isActionActive = selectedTutorial?.action.id === action.id;

                              return (
                                <button
                                  key={action.id}
                                  type="button"
                                  className={`${styles.navActionButton} ${isActionActive ? styles.navActionButtonActive : ""}`.trim()}
                                  onClick={() => handleSelectTutorial(action.id)}
                                  aria-pressed={isActionActive}
                                >
                                  <span className={styles.navActionTitle}>{action.title}</span>
                                  <span className={styles.navActionMeta}>{action.screenArea}</span>
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <section id="help-detail" className={styles.detailPanel}>
            {selectedTutorial ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Tutorial seleccionado</p>
                    <h2 className={styles.detailTitle}>{selectedTutorial.action.title}</h2>
                    <p className={styles.detailSummary}>{selectedTutorial.section.summary}</p>
                  </div>

                  <div className={styles.sectionHeaderActions}>
                    <span className={`${styles.audienceBadge} ${getAudienceBadgeClass(selectedTutorial.section.access)}`.trim()}>
                      Pantalla: {AUDIENCE_LABEL[selectedTutorial.section.access]}
                    </span>
                    <span className={`${styles.audienceBadge} ${getAudienceBadgeClass(selectedTutorial.action.audience)}`.trim()}>
                      Tutorial: {AUDIENCE_LABEL[selectedTutorial.action.audience]}
                    </span>
                    <Link to={selectedTutorial.section.route} className={styles.openScreenLink}>
                      Abrir pantalla
                    </Link>
                  </div>
                </div>

                <div className={styles.contextGrid}>
                  <article className={styles.contextCard}>
                    <p className={styles.contextEyebrow}>Operacion</p>
                    <h3 className={styles.contextTitle}>{selectedTutorial.section.menuButton}</h3>
                    <p className={styles.contextText}>{selectedTutorial.section.screenTitle}</p>
                  </article>

                  <article className={styles.contextCard}>
                    <p className={styles.contextEyebrow}>Suboperacion</p>
                    <h3 className={styles.contextTitle}>{selectedTutorial.action.screenArea}</h3>
                    <p className={styles.contextText}>
                      Grupo {selectedTutorial.section.menuGroup} con acceso {AUDIENCE_LABEL[selectedTutorial.action.audience]}.
                    </p>
                  </article>
                </div>

                <div className={styles.screenPanel}>
                  <div className={styles.screenPanelHeader}>
                    <div>
                      <p className={styles.screenEyebrow}>Pantalla</p>
                      <h3 className={styles.screenTitle}>{selectedTutorial.section.screenTitle}</h3>
                    </div>
                    <span className={styles.routeChip}>{selectedTutorial.section.route}</span>
                  </div>

                  <div className={styles.areaList}>
                    {selectedTutorial.section.screenAreas.map((area) => (
                      <span key={`${selectedTutorial.section.id}-${area}`} className={styles.areaPill}>
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedTutorial.section.actions.length > 1 ? (
                  <section className={styles.relatedSection}>
                    <div className={styles.relatedHeader}>
                      <div>
                        <p className={styles.actionEyebrow}>Misma pantalla</p>
                        <h3 className={styles.relatedTitle}>Otras suboperaciones</h3>
                      </div>
                    </div>

                    <div className={styles.relatedActions}>
                      {selectedTutorial.section.actions.map((action) => {
                        const isSelected = action.id === selectedTutorial.action.id;

                        return (
                          <button
                            key={action.id}
                            type="button"
                            className={`${styles.relatedActionButton} ${isSelected ? styles.relatedActionButtonActive : ""}`.trim()}
                            onClick={() => handleSelectTutorial(action.id)}
                            aria-pressed={isSelected}
                          >
                            <span className={styles.relatedActionTitle}>{action.title}</span>
                            <span className={styles.relatedActionMeta}>{action.screenArea}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <article className={styles.tutorialCard}>
                  <div className={styles.actionHeader}>
                    <div>
                      <p className={styles.actionEyebrow}>Pasos</p>
                      <h3 className={styles.actionTitle}>{selectedTutorial.action.title}</h3>
                      <p className={styles.actionArea}>Se hace en: {selectedTutorial.action.screenArea}</p>
                    </div>
                  </div>

                  {selectedTutorial.action.note ? (
                    <div className={styles.noteBox}>
                      <strong>Importante:</strong> {selectedTutorial.action.note}
                    </div>
                  ) : null}

                  <ol className={styles.stepList}>
                    {selectedTutorial.action.steps.map((step, index) => (
                      <li key={`${selectedTutorial.action.id}-${index}`} className={styles.stepItem}>
                        <div className={styles.stepMarker}>
                          <span className={styles.stepDot}>{index + 1}</span>
                          {index < selectedTutorial.action.steps.length - 1 ? (
                            <span className={styles.stepLine} aria-hidden="true" />
                          ) : null}
                        </div>

                        <div className={styles.stepBody}>
                          <p className={styles.stepLabel}>Paso {index + 1}</p>
                          <p className={styles.stepText}>{step}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </article>
              </>
            ) : (
              <div className={styles.emptyState}>
                <p className={styles.sectionEyebrow}>Sin tutoriales</p>
                <h2 className={styles.detailTitle}>No hay contenido disponible para este perfil</h2>
                <p className={styles.detailSummary}>Cuando existan tutoriales visibles para tu rol van a aparecer aqui.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function getVisibleSections(isAdmin: boolean): HelpSection[] {
  const sections: HelpSection[] = [];
  for (const section of helpSections) {
    if (!isAdmin && section.access === "admin") {
      continue;
    }

    const actions = section.actions.filter((action) => isAdmin || action.audience !== "admin");
    if (actions.length === 0) {
      continue;
    }

    sections.push({ ...section, actions });
  }
  return sections;
}

function getAudienceBadgeClass(audience: HelpAudience) {
  if (audience === "admin") return styles.badgeAdmin;
  if (audience === "operator") return styles.badgeOperator;
  return styles.badgeAll;
}

function resolveSelectedActionId(sections: HelpSection[], tutorials: HelpTutorial[], currentActionId: string | null) {
  const hash = typeof window === "undefined" ? "" : window.location.hash.replace("#", "");

  if (hash) {
    const matchingTutorial = tutorials.find((tutorial) => tutorial.action.id === hash);
    if (matchingTutorial) {
      return matchingTutorial.action.id;
    }

    const matchingSection = sections.find((section) => section.id === hash);
    if (matchingSection?.actions[0]) {
      return matchingSection.actions[0].id;
    }
  }

  if (currentActionId && tutorials.some((tutorial) => tutorial.action.id === currentActionId)) {
    return currentActionId;
  }

  return tutorials[0]?.action.id ?? null;
}
