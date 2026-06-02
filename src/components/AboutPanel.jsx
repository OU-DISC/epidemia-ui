import React from "react";
import { ABOUT_EPIDEMIA } from "../content/aboutEpidemia";

export default function AboutPanel() {
  return (
    <article className="about-panel">
      <header className="about-panel-header">
        <h4>{ABOUT_EPIDEMIA.title}</h4>
        <p className="about-panel-tagline">{ABOUT_EPIDEMIA.tagline}</p>
      </header>

      {ABOUT_EPIDEMIA.sections.map((section) => (
        <section key={section.heading} className="about-section">
          <h5>{section.heading}</h5>

          {section.body?.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}

          {section.items?.map((item) => (
            <dl key={item.term} className="about-definition">
              <dt>{item.term}</dt>
              <dd>{item.detail}</dd>
            </dl>
          ))}

          {section.footer ? <p className="about-section-footer">{section.footer}</p> : null}
        </section>
      ))}
    </article>
  );
}
