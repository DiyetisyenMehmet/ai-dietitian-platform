# APP-AUTH-BRAND-HEADER-SIZE-ALIGNMENT-A2

Base staging HEAD `d70832dfcce9ff4173a8f8dc470e5bde0f137d9f`, TREE
`f7643cb625f4f25ed655131ca93bb04f686f91bd` (includes PR92's Admin-isolated Test2
router). Repository name in task has a trailing typo; use the established
DiyetisyenMehmet/ai-dietitian-platform repository.

Only the shared AuthLayout opts into the auth presentation variant. Public site
branding remains the existing default. No login, session, phone, Google, Admin,
backend, database, routing or runtime configuration changes.

The existing approved 1004x214 transparent PNG is rendered at **144px wide,
~30.69px tall**, down from 160px / ~34.10px on mobile. The unchanged 44x44 icon
and artwork now share their vertical center in a two-column grid, with an 8px
gap. The intact slogan is 11px with 14px line height, aligned to the artwork's
left edge. Its row position follows the artwork with no overlap, keeping the
mobile brand stack at ~53px so the form is not displaced. At the existing
1024–1279px breakpoint, the icon remains 36px and the compact wordmark is 128px.

No image file is edited, resampled or regenerated. Asset SHA256:
- wordmark: fab0cec0cade688e22222df9675460b3bcefbbdd36e86c25509c2c49b41ea083
- icon: 02e25acbea1c2d2c4eee48aaaa418db9a9f7c6e0350dfd62c53fcf79d168d8ce
The approved gradient, alpha, letter shapes and existing dark contour shadow stay.

Targeted workflow uses the real baseline source in a separate detached worktree
and the changed source, the same synthetic-guest API and the same approved assets.
Six baseline and six after cases cover 390/412/430px × light/dark at 3x density.
Full-page and header screenshots plus JSON bounds are retained. After checks:
smaller proportional artwork, same icon size, centers within 1px, 8px gap, aligned
nonoverlapping slogan, theme toggle clearance, no overflow, and less than 1px
change in brand height/form top. Basic frontend build includes types/lint.

No real accounts/provider calls, APK, staging merge/deploy, Admin operation,
Neon/Test2 change or new feature is performed. PR is for review; release requires
separate manager authorization. Stop after this handover.
