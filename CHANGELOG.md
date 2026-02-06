# Changelog

## Privacy Ferret — Changes from Privacy Badger 1.9.2 to Privacy Ferret 0.1.0 BETA 12

### Project base
- Forked from **Privacy Badger 1.9.2 (XUL)** by the **Electronic Frontier Foundation (EFF)**
- Project is now **explicitly targeted at Pale Moon**
- License **GPLv3+** preserved with full attribution

---

### Rebranding
- Complete rename from **Privacy Badger** to **Privacy Ferret**
- New Ferret icon set (toolbar, Add-ons Manager, UI)
- All Badger visual assets removed
- UI text updated to reflect the new project identity

---

### Pale Moon compatibility
- Extension now identifies as a **native Pale Moon add-on**
- No Moon Tester Tool required
- Stable operation on **Linux and Windows**
- Platform-specific issues resolved

---

### Core functionality
- Original Privacy Badger **heuristic blocking logic preserved**
- Automatic learning of tracking domains works as expected
- Domain states update without user intervention
- Tracker counter behavior fixed and unified

---

### Technical fixes (BETA series)
- Fixed exception: `NS_ERROR_FAILURE [nsIURI.host]`
- Safe handling of non-network URIs:
  - `about:`
  - `resource:`
  - `chrome:`
  - `file:`
- Eliminated severe startup and browsing slowdowns
- Error Console is now **clean on Linux and Windows**

---

### UI & UX
- New **welcome page shown after installation**
- Functional **Close** button (proper tab closing)
- Removed UI actions:
  - “Donate to EFF”
  - “Report broken site”
- Removed non-functional and legacy UI elements

---

### Code cleanup
- Removed unused test and legacy files
- Retained some legacy initialization code for stability
- Codebase prepared for further incremental cleanup

---

### Acknowledgements
- **Electronic Frontier Foundation (EFF)** — original Privacy Badger
- **JustOff** — historical Pale Moon fork
- Pale Moon community — testing and feedback

