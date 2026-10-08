import UIKit
import WebKit

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
        config.applicationNameForUserAgent = "DiewishIOSQA/0.1.0"
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
        let controls = [("Giriş", "qa-login"), ("←", "qa-back"), ("↻", "qa-refresh"), ("Ana", "qa-dashboard"), ("Koç", "qa-coach-list"), ("Bildirim", "qa-notification-preferences"), ("Profil", "qa-profile")]
        for (title, identifier) in controls {
            let button = UIButton(type: .system)
            button.setTitle(title, for: .normal)
            button.accessibilityIdentifier = identifier
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
        if identifier == "qa-back" { if webView.canGoBack { webView.goBack() }; return }
        if identifier == "qa-refresh" { webView.reload(); return }
        let key = String(identifier.dropFirst(3))
        guard let route = routes[key] else { return }
        webView.load(URLRequest(url: URL(string: route, relativeTo: origin)!.absoluteURL))
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

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let source = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, source.protocol == "https", source.host == origin.host,
              source.port == 443 || source.port == 0, trusted(webView.url),
              let body = message.body as? [String: Any], body["version"] as? Int == 1,
              body["operation"] as? String == "capabilities" else { return }
        // A capability contract, not Android bridge impersonation. Unsupported
        // operations stay unavailable; no auth tokens or arbitrary JS are accepted.
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('diewish:ios-capabilities',{detail:{version:1,runtime:'wkwebview',camera:false,barcode:false,localNotifications:false,push:false,deepLink:false}}))", completionHandler: nil)
    }

    deinit { contentController?.removeScriptMessageHandler(forName: "diewishIOS") }
}
