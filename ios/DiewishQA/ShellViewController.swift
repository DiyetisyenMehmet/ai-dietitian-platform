import UIKit
import WebKit
import CryptoKit

/// Staging-only QA host. The existing web application owns all domain logic.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) { target?.userContentController(controller, didReceive: message) }
}

final class ShellViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let origin = URL(string: "https://staging.diewish.com")!
    private var webView: WKWebView!
    private let routes = ["login": "/login", "dashboard": "/dashboard", "coach-list": "/ai", "notification-preferences": "/profile/notifications", "profile": "/profile"]
    private var contentController: WKUserContentController!
    private var evidenceButton: UIButton!
    private var checkEvidenceButton: UIButton!
    private var restoreEvidenceButton: UIButton!
    private var verifiedAlias: String?
    private var identityFile: URL { FileManager.default.temporaryDirectory.appendingPathComponent("qa-runtime-identity.json") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // Persistent first-party cookies/storage.
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        contentController = WKUserContentController()
        config.userContentController = contentController
        contentController.add(WeakMessageHandler(self), name: "diewishIOS")
        try? FileManager.default.removeItem(at: identityFile)
        // Observe normal successful auth responses. No token crosses this QA channel.
        contentController.addUserScript(WKUserScript(source: """
        (() => {
          const original = window.fetch;
          window.fetch = function(...args) {
            const result = Reflect.apply(original, this, args);
            try {
              const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, location.href);
              const auth = ['/api/auth/login', '/api/auth/me', '/api/auth/refresh-token'];
              if (url.origin === location.origin && auth.includes(url.pathname)) {
                result.then(response => { if (response.status === 401) window.webkit.messageHandlers.diewishIOS.postMessage({version:1,operation:'qa-logout'}); if (response.ok) response.clone().json().then(body => {
                  const id = body?.data?.user?.id;
                  if (typeof id === 'string') window.webkit.messageHandlers.diewishIOS.postMessage({version:1,operation:'qa-account',id});
                }).catch(() => {}); }).catch(() => {});
              }
              if (url.origin === location.origin && url.pathname === '/api/auth/logout') {
                result.then(response => { if (response.ok) window.webkit.messageHandlers.diewishIOS.postMessage({version:1,operation:'qa-logout'}); }).catch(() => {});
              }
            } catch (_) {}
            return result;
          };
        })();
        """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.applicationNameForUserAgent = "DiewishIOSQA/0.1.0"
        if let file = Bundle.main.url(forResource: "evidence-mask", withExtension: "js"),
           let script = try? String(contentsOf: file, encoding: .utf8) {
            contentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = nil
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .onDrag
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        let toolbar = UIStackView()
        toolbar.axis = .horizontal
        toolbar.distribution = .fillEqually
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toolbar)
        let controls = [("Giriş", "qa-login"), ("←", "qa-back"), ("↻", "qa-refresh"), ("Ana", "qa-dashboard"), ("Koç", "qa-coach-list"), ("Bildirim", "qa-notification-preferences"), ("Profil", "qa-profile"), ("QA", "qa-evidence"), ("✓", "qa-check-evidence"), ("×", "qa-restore-evidence")]
        for (title, identifier) in controls {
            let button = UIButton(type: .system)
            button.setTitle(title, for: .normal)
            button.accessibilityIdentifier = identifier
            if identifier == "qa-evidence" { evidenceButton = button }
            if identifier == "qa-check-evidence" { checkEvidenceButton = button }
            if identifier == "qa-restore-evidence" { restoreEvidenceButton = button }
            button.addAction(UIAction { [weak self] _ in self?.navigate(identifier) }, for: .touchUpInside)
            toolbar.addArrangedSubview(button)
        }
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 36),
            webView.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        webView.load(URLRequest(url: origin.appendingPathComponent("dashboard")))
    }

    private func navigate(_ identifier: String) {
        if identifier == "qa-evidence" { prepareEvidence(); return }
        if identifier == "qa-check-evidence" { checkEvidence(); return }
        if identifier == "qa-restore-evidence" { restoreEvidence(); return }
        if identifier == "qa-back" { if webView.canGoBack { webView.goBack() }; return }
        if identifier == "qa-refresh" { webView.reload(); return }
        let key = String(identifier.dropFirst(3))
        guard let route = routes[key] else { return }
        webView.load(URLRequest(url: URL(string: route, relativeTo: origin)!.absoluteURL))
    }

    private func prepareEvidence() {
        evidenceButton.accessibilityValue = "WAITING"
        let authenticated = ProcessInfo.processInfo.environment["QA_SYNTHETIC_ACCOUNT"] == "YES"
        guard trusted(webView.url), !authenticated || verifiedAlias != nil else {
            evidenceButton.accessibilityValue = "ACCOUNT_UNVERIFIED"; return
        }
        webView.callAsyncJavaScript("return window.__diewishEvidenceMask ? await window.__diewishEvidenceMask.begin() : false;", arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            let ready: Bool
            if case .success(let value) = result { ready = (value as? Bool) == true } else { ready = false }
            self.evidenceButton.accessibilityValue = ready ? "READY" : "HEALTH_DATA_SCREENSHOT_GUARD_FAIL"
            if !ready { self.describeMaskFailure() }
            if ready, let alias = self.verifiedAlias,
               let data = try? JSONSerialization.data(withJSONObject: ["accountAlias": alias, "captureReadyAt": Date().timeIntervalSince1970, "screenshotGuard": "HEALTH_MASK_V1"]) {
                try? data.write(to: self.identityFile, options: .atomic)
            }
        }
    }

    private func describeMaskFailure() {
        // Read only guard-owned metadata, never page text or account fields.
        webView.evaluateJavaScript("window.__diewishEvidenceMask ? ({reason:window.__diewishEvidenceMask.reason(),detail:window.__diewishEvidenceMask.fontDetail()}) : ({reason:'MASK_SCRIPT_MISSING',detail:'NONE'})") { [weak self] value, error in
            guard let self else { return }
            let reasons: Set<String> = ["NONE", "MASK_SCRIPT_MISSING", "PREPARE_FAILED", "MASK_NOT_ACTIVE", "VIEWPORT_CHANGED", "FONT_CHANGED", "DOCUMENT_MUTATION"]
            let details: Set<String> = ["NONE", "FONT_LOADING", "FONT_COUNT", "FONT_REFERENCE", "FONT_FAMILY", "FONT_STYLE", "FONT_WEIGHT", "FONT_STRETCH", "FONT_UNICODE_RANGE", "FONT_VARIANT", "FONT_FEATURES", "FONT_GEOMETRY", "FONT_STATUS", "FONT_STATUS_LOADED_UNLOADED", "FONT_STATUS_LOADED_LOADING", "FONT_STATUS_UNLOADED_LOADED", "FONT_STATUS_UNLOADED_LOADING", "FONT_STATUS_LOADING_LOADED", "FONT_STATUS_LOADING_ERROR"]
            let payload = value as? [String: Any]
            let reason = payload?["reason"] as? String ?? "JS_EVALUATION_FAILED"
            let detail = payload?["detail"] as? String ?? "NONE"
            let safeReason = error == nil && reasons.contains(reason) ? reason : "JS_EVALUATION_FAILED"
            let safeDetail = details.contains(detail) ? detail : "NONE"
            self.evidenceButton.accessibilityValue = safeReason + "|" + safeDetail
        }
    }

    private func checkEvidence() {
        checkEvidenceButton.accessibilityValue = "WAITING"
        webView.evaluateJavaScript("window.__diewishEvidenceMask?.active() === true") { [weak self] value, error in
            self?.checkEvidenceButton.accessibilityValue = error == nil && (value as? Bool) == true ? "READY" : "HEALTH_DATA_SCREENSHOT_GUARD_FAIL"
        }
    }

    private func restoreEvidence() {
        restoreEvidenceButton.accessibilityValue = "WAITING"
        webView.evaluateJavaScript("window.__diewishEvidenceMask?.restore() === true") { [weak self] value, error in
            self?.restoreEvidenceButton.accessibilityValue = error == nil && (value as? Bool) == true ? "RESTORED" : "HEALTH_DATA_SCREENSHOT_GUARD_FAIL"
            self?.invalidateCaptureProof()
        }
    }

    private func invalidateCaptureProof() {
        guard let alias = verifiedAlias,
              let data = try? JSONSerialization.data(withJSONObject: ["accountAlias": alias]) else {
            try? FileManager.default.removeItem(at: identityFile); return
        }
        try? data.write(to: identityFile, options: .atomic)
    }

    private func recordIdentity(_ id: String) {
        let env = ProcessInfo.processInfo.environment
        guard env["QA_SYNTHETIC_ACCOUNT"] == "YES", id == env["QA_ACCOUNT_ID"],
              let key = env["QA_ACCOUNT_HMAC_KEY"], key.count >= 32 else {
            verifiedAlias = nil; try? FileManager.default.removeItem(at: identityFile); return
        }
        let digest = HMAC<SHA256>.authenticationCode(for: Data(id.utf8), using: SymmetricKey(data: Data(key.utf8)))
        let alias = "qa-" + String(digest.map { String(format: "%02x", $0) }.joined().prefix(24))
        verifiedAlias = String(alias)
        if let data = try? JSONSerialization.data(withJSONObject: ["accountAlias": String(alias), "verifiedAt": Date().timeIntervalSince1970]) {
            try? data.write(to: identityFile, options: .atomic)
        }
    }

    private func trusted(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == "https" && url.host == origin.host && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // First-party frames only. External identity-provider flows need a separately
        // reviewed ASWebAuthenticationSession adapter; they are not silently allowed.
        decisionHandler(trusted(action.request.url) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, trusted(action.request.url) { webView.load(action.request) }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        verifiedAlias = nil
        try? FileManager.default.removeItem(at: identityFile)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let source = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, source.protocol == "https", source.host == origin.host,
              source.port == 443 || source.port == 0, trusted(webView.url),
              let body = message.body as? [String: Any], body["version"] as? Int == 1,
              let operation = body["operation"] as? String else { return }
        if operation == "qa-account", let id = body["id"] as? String { recordIdentity(id); return }
        if operation == "qa-logout" { verifiedAlias = nil; try? FileManager.default.removeItem(at: identityFile); return }
        if operation == "qa-mask-invalid" {
            evidenceButton.accessibilityValue = "HEALTH_DATA_SCREENSHOT_GUARD_FAIL"
            invalidateCaptureProof()
            // Post-arming invalidation has the same fixed diagnostic contract
            // as preparation failure; readiness and export remain blocked.
            describeMaskFailure(); return
        }
        guard operation == "capabilities" else { return }
        // A capability contract, not Android bridge impersonation. Unsupported
        // operations stay unavailable; no auth tokens or arbitrary JS are accepted.
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('diewish:ios-capabilities',{detail:{version:1,runtime:'wkwebview',camera:false,barcode:false,localNotifications:false,push:false,deepLink:false}}))", completionHandler: nil)
    }

    deinit { contentController?.removeScriptMessageHandler(forName: "diewishIOS") }
}
