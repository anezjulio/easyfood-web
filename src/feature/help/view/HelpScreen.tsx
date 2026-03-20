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

export default function HelpScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const visibleSections = getVisibleSections(isAdmin);
  const groupedSections = GROUP_ORDER.map((group) => ({
    group,
    sections: visibleSections.filter((section) => section.menuGroup === group),
  })).filter((group) => group.sections.length > 0);

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

        <section id="help-index" className={styles.indexSection}>
          <div className={styles.indexHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Indice</p>
              <h2 className={styles.indexTitle}>Empieza por el boton del menu que quieres usar</h2>
            </div>
            <div className={styles.indexSummary}>
              <span className={styles.summaryBadge}>{visibleSections.length} pantallas</span>
              <span className={styles.summaryBadge}>
                {visibleSections.reduce((total, section) => total + section.actions.length, 0)} tutoriales
              </span>
            </div>
          </div>

          <div className={styles.indexGrid}>
            {groupedSections.map(({ group, sections }) => (
              <article key={group} className={styles.indexCard}>
                <div className={styles.indexCardHeader}>
                  <div>
                    <h3 className={styles.indexGroupTitle}>{group}</h3>
                    <p className={styles.indexGroupDescription}>{GROUP_DESCRIPTION[group]}</p>
                  </div>
                  <span className={styles.groupCount}>{sections.length}</span>
                </div>

                <div className={styles.indexList}>
                  {sections.map((section) => (
                    <a key={section.id} href={`#${section.id}`} className={styles.indexLink}>
                      <span className={styles.indexLinkTitle}>{section.menuButton}</span>
                      <span className={styles.indexLinkMeta}>
                        {section.screenTitle} - {section.actions.length} tutoriales
                      </span>
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.sectionsColumn}>
          {groupedSections.map(({ group, sections }) => (
            <section key={group} className={styles.groupSection}>
              <div className={styles.groupHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Grupo</p>
                  <h2 className={styles.groupTitle}>{group}</h2>
                  <p className={styles.groupDescription}>{GROUP_DESCRIPTION[group]}</p>
                </div>
                <a href="#help-index" className={styles.backToIndex}>
                  Volver al indice
                </a>
              </div>

              <div className={styles.sectionList}>
                {sections.map((section) => (
                  <article key={section.id} id={section.id} className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                      <div className={styles.sectionHeaderMain}>
                        <p className={styles.sectionEyebrow}>Boton del menu</p>
                        <h3 className={styles.menuButtonTitle}>{section.menuButton}</h3>
                        <p className={styles.sectionSummary}>{section.summary}</p>
                      </div>

                      <div className={styles.sectionHeaderActions}>
                        <span className={`${styles.audienceBadge} ${getAudienceBadgeClass(section.access)}`.trim()}>
                          {AUDIENCE_LABEL[section.access]}
                        </span>
                        <Link to={section.route} className={styles.openScreenLink}>
                          Abrir pantalla
                        </Link>
                      </div>
                    </div>

                    <div className={styles.screenPanel}>
                      <div className={styles.screenPanelHeader}>
                        <div>
                          <p className={styles.screenEyebrow}>Pantalla</p>
                          <h4 className={styles.screenTitle}>{section.screenTitle}</h4>
                        </div>
                        <span className={styles.routeChip}>{section.route}</span>
                      </div>

                      <div className={styles.areaList}>
                        {section.screenAreas.map((area) => (
                          <span key={`${section.id}-${area}`} className={styles.areaPill}>
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className={styles.actionIntro}>
                      <h4 className={styles.actionIntroTitle}>Operaciones permitidas</h4>
                      <p className={styles.actionIntroText}>Cada bloque te dice donde hacerlo y los pasos exactos.</p>
                    </div>

                    <div className={styles.actionGrid}>
                      {section.actions.map((action) => (
                        <article key={action.id} className={styles.actionCard}>
                          <div className={styles.actionHeader}>
                            <div>
                              <p className={styles.actionEyebrow}>Operacion</p>
                              <h5 className={styles.actionTitle}>{action.title}</h5>
                              <p className={styles.actionArea}>Se hace en: {action.screenArea}</p>
                            </div>
                            <span className={`${styles.audienceBadge} ${getAudienceBadgeClass(action.audience)}`.trim()}>
                              {AUDIENCE_LABEL[action.audience]}
                            </span>
                          </div>

                          {action.note ? (
                            <div className={styles.noteBox}>
                              <strong>Importante:</strong> {action.note}
                            </div>
                          ) : null}

                          <ol className={styles.stepList}>
                            {action.steps.map((step, index) => (
                              <li key={`${action.id}-${index}`} className={styles.stepItem}>
                                <div className={styles.stepMarker}>
                                  <span className={styles.stepDot}>{index + 1}</span>
                                  {index < action.steps.length - 1 ? <span className={styles.stepLine} aria-hidden="true" /> : null}
                                </div>

                                <div className={styles.stepBody}>
                                  <p className={styles.stepLabel}>Paso {index + 1}</p>
                                  <p className={styles.stepText}>{step}</p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function getVisibleSections(isAdmin: boolean): HelpSection[] {
  return helpSections.flatMap((section) => {
    if (!isAdmin && section.access === "admin") {
      return [];
    }

    const actions = section.actions.filter((action) => isAdmin || action.audience !== "admin");
    if (actions.length === 0) {
      return [];
    }

    return [{ ...section, actions }];
  });
}

function getAudienceBadgeClass(audience: HelpAudience) {
  if (audience === "admin") return styles.badgeAdmin;
  if (audience === "operator") return styles.badgeOperator;
  return styles.badgeAll;
}
