import XCTest
import Darwin

final class RuntimeTests: XCTestCase {
    private func stage(_ phase: String, _ status: String) {
        print("IOS_STAGE " + phase + " " + status)
        fflush(stdout)
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        stage("TEST_SETUP", "PASS")
    }

    private func screenshot(_ app: XCUIApplication, _ name: String) {
        let guardButton = app.buttons["qa-evidence"]
        stage("HEALTH_GUARD_PREPARE", "RUNNING")
        guardButton.tap()
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == 'READY'"), object: guardButton)
        guard XCTWaiter.wait(for: [ready], timeout: 30) == .completed else {
            describeGuardFailure(guardButton)
            stage("HEALTH_GUARD", "FAIL")
            XCTFail("HEALTH_DATA_SCREENSHOT_GUARD_FAIL"); return
        }
        stage("HEALTH_GUARD_PREPARE", "PASS")
        let snapshot = app.screenshot()
        let check = app.buttons["qa-check-evidence"]
        check.tap()
        let checked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == 'READY'"), object: check)
        guard XCTWaiter.wait(for: [checked], timeout: 10) == .completed else {
            stage("HEALTH_GUARD", "FAIL")
            XCTFail("HEALTH_DATA_SCREENSHOT_GUARD_FAIL"); return
        }
        let restore = app.buttons["qa-restore-evidence"]
        restore.tap()
        let restored = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == 'RESTORED'"), object: restore)
        guard XCTWaiter.wait(for: [restored], timeout: 10) == .completed else {
            stage("HEALTH_GUARD", "FAIL")
            XCTFail("HEALTH_DATA_SCREENSHOT_GUARD_FAIL"); return
        }
        let attachment = XCTAttachment(screenshot: snapshot)
        attachment.name = name + "-ios-simulator-guarded-health-v1"
        attachment.lifetime = .keepAlways
        add(attachment)
        stage("HEALTH_GUARD_CAPTURE", "PASS")
    }

    private func describeGuardFailure(_ button: XCUIElement) {
        let fields = (button.value as? String ?? "UNAVAILABLE").split(separator: "|", maxSplits: 1).map(String.init)
        let reasons: Set<String> = ["READY", "WAITING", "ACCOUNT_UNVERIFIED", "HEALTH_DATA_SCREENSHOT_GUARD_FAIL", "NONE", "MASK_SCRIPT_MISSING", "PREPARE_FAILED", "MASK_NOT_ACTIVE", "VIEWPORT_CHANGED", "FONT_CHANGED", "DOCUMENT_MUTATION", "JS_EVALUATION_FAILED", "UNAVAILABLE"]
        let details: Set<String> = ["NONE", "FONT_LOADING", "FONT_COUNT", "FONT_REFERENCE", "FONT_FAMILY", "FONT_STYLE", "FONT_WEIGHT", "FONT_STRETCH", "FONT_UNICODE_RANGE", "FONT_VARIANT", "FONT_FEATURES", "FONT_GEOMETRY", "FONT_STATUS", "FONT_STATUS_LOADED_UNLOADED", "FONT_STATUS_LOADED_LOADING", "FONT_STATUS_UNLOADED_LOADED", "FONT_STATUS_UNLOADED_LOADING", "FONT_STATUS_LOADING_LOADED", "FONT_STATUS_LOADING_ERROR"]
        let reason = fields.first ?? "UNAVAILABLE"
        print("IOS_GUARD_REASON", reasons.contains(reason) ? reason : "UNAVAILABLE")
        if fields.count == 2 && details.contains(fields[1]) { print("IOS_GUARD_FONT_DETAIL", fields[1]) }
        fflush(stdout)
    }

    private func configuredApp() -> XCUIApplication {
        stage("APP_CONFIGURATION", "RUNNING")
        let app = XCUIApplication()
        let env = ProcessInfo.processInfo.environment
        for key in ["QA_SYNTHETIC_ACCOUNT", "QA_ACCOUNT_ID", "QA_ACCOUNT_HMAC_KEY"] {
            if let value = env[key] { app.launchEnvironment[key] = value }
        }
        stage("APP_CONFIGURATION", "PASS")
        return app
    }

    private func login(_ app: XCUIApplication) throws {
        let env = ProcessInfo.processInfo.environment
        guard env["QA_SYNTHETIC_ACCOUNT"] == "YES", let email = env["QA_EMAIL"], !email.isEmpty,
              let password = env["QA_PASSWORD"], !password.isEmpty else {
            throw XCTSkip("TEST_ACCOUNT_SECRETS_REQUIRED")
        }
        app.buttons["qa-login"].tap()
        let emailInput = app.webViews.textFields.firstMatch
        XCTAssertTrue(emailInput.waitForExistence(timeout: 45), "LOGIN_SURFACE_UNAVAILABLE")
        emailInput.tap()
        emailInput.typeText(email)
        let passwordInput = app.webViews.secureTextFields.firstMatch
        XCTAssertTrue(passwordInput.exists, "PASSWORD_FIELD_UNAVAILABLE")
        passwordInput.tap()
        passwordInput.typeText(password)
        let submit = app.webViews.buttons["Giriş Yap"]
        // Drag dismisses the keyboard without implicitly submitting twice.
        if app.keyboards.count > 0 { app.webViews.firstMatch.swipeUp() }
        XCTAssertTrue(submit.waitForExistence(timeout: 15), "LOGIN_SUBMIT_UNAVAILABLE")
        submit.tap()
        XCTAssertTrue(app.webViews.staticTexts["Bugünkü Yolculuğum"].waitForExistence(timeout: 60), "AUTHENTICATED_DASHBOARD_UNAVAILABLE")
    }

    func testPublicLoginRuntime() throws {
        if ProcessInfo.processInfo.environment["QA_SYNTHETIC_ACCOUNT"] == "YES" {
            throw XCTSkip("PUBLIC_LOGIN_SURFACE_RECORDED_IN_PUBLIC_MODE")
        }
        let app = configuredApp()
        stage("APP_LAUNCH", "RUNNING")
        app.launch()
        stage("APP_LAUNCH", "PASS")
        app.buttons["qa-login"].tap()
        let ready = app.webViews.buttons["Giriş Yap"].waitForExistence(timeout: 60)
        if !ready { screenshot(app, "login-runtime-diagnostic") }
        XCTAssertTrue(ready, "LOGIN_SURFACE_UNAVAILABLE")
        screenshot(app, "login")
    }

    func testAuthenticatedScreensAndRelaunch() throws {
        let app = configuredApp()
        stage("APP_LAUNCH", "RUNNING")
        app.launch()
        stage("APP_LAUNCH", "PASS")
        stage("AUTH_LOGIN", "RUNNING")
        try login(app)
        stage("AUTH_LOGIN", "PASS")
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
        stage("APP_LAUNCH", "RUNNING")
        app.launch()
        stage("APP_LAUNCH", "PASS")
        XCTAssertTrue(app.webViews.staticTexts["Bugünkü Yolculuğum"].waitForExistence(timeout: 60), "SESSION_RELAUNCH_UNAVAILABLE")
        screenshot(app, "session-relaunch")
    }
}
