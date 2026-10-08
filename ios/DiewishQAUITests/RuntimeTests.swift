import XCTest

final class RuntimeTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    private func screenshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name + "-ios-simulator"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func login(_ app: XCUIApplication) throws {
        let env = ProcessInfo.processInfo.environment
        guard env["QA_SYNTHETIC_ACCOUNT"] == "YES", let email = env["QA_EMAIL"], !email.isEmpty,
              let password = env["QA_PASSWORD"], !password.isEmpty else {
            throw XCTSkip("TEST_ACCOUNT_SECRETS_REQUIRED")
        }
        let emailInput = app.webViews.textFields.firstMatch
        XCTAssertTrue(emailInput.waitForExistence(timeout: 45), "LOGIN_SURFACE_UNAVAILABLE")
        emailInput.tap()
        emailInput.typeText(email)
        let passwordInput = app.webViews.secureTextFields.firstMatch
        XCTAssertTrue(passwordInput.exists, "PASSWORD_FIELD_UNAVAILABLE")
        passwordInput.tap()
        passwordInput.typeText(password)
        let submit = app.webViews.buttons["Giriş Yap"]
        // WKWebView submit button may sit under the keyboard. Return dismisses it.
        if app.keyboards.count > 0 { passwordInput.typeText("\n") }
        if submit.exists && submit.isHittable { submit.tap() }
        XCTAssertTrue(app.webViews.staticTexts["Bugünkü Yolculuğun"].waitForExistence(timeout: 60), "AUTHENTICATED_DASHBOARD_UNAVAILABLE")
    }

    func testPublicLoginRuntime() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.webViews.buttons["Giriş Yap"].waitForExistence(timeout: 60), "LOGIN_SURFACE_UNAVAILABLE")
        screenshot(app, "login")
    }

    func testAuthenticatedScreensAndRelaunch() throws {
        let app = XCUIApplication()
        app.launch()
        try login(app)
        screenshot(app, "dashboard")
        app.buttons["qa-coach-list"].tap()
        XCTAssertTrue(app.webViews.textViews["Mesaj"].waitForExistence(timeout: 45), "COACH_UNAVAILABLE")
        let history = app.webViews.buttons["Sohbet geçmişi"]
        if history.exists { history.tap() }
        XCTAssertTrue(app.webViews.buttons["Yeni Sohbet"].waitForExistence(timeout: 30), "COACH_LIST_UNAVAILABLE")
        screenshot(app, "coach-list")
        app.buttons["qa-notification-preferences"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Bildirim Tercihleri"].waitForExistence(timeout: 45), "NOTIFICATION_PREFERENCES_UNAVAILABLE")
        screenshot(app, "notification-preferences")
        app.buttons["qa-profile"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Sağlık Profilim"].waitForExistence(timeout: 45), "PROFILE_UNAVAILABLE")
        screenshot(app, "profile")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.webViews.staticTexts["Bugünkü Yolculuğun"].waitForExistence(timeout: 60), "SESSION_RELAUNCH_UNAVAILABLE")
        screenshot(app, "session-relaunch")
    }
}
