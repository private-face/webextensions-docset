import * as React from "react";
import "./index.scss";

export function Footer() {
  return (
    <footer id="nav-footer" className="page-footer">
      <div className="content-container">
        <p id="license" className="footer-license">
          &copy; 2005-{new Date().getFullYear()} Mozilla and individual
          contributors. Content is available under{" "}
          <a href="/docs/MDN/About#Copyrights_and_licenses">these licenses</a>.
        </p>
      </div>
    </footer>
  );
}
