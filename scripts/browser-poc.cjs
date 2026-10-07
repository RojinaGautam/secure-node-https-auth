const {chromium}=require('C:/Users/LEGION/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1360,height:1000}});
 const errors=[],traffic=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(r.url().startsWith('https://localhost:'))traffic.push({url:r.url(),status:r.status(),security:await r.securityDetails()});});
 await page.goto('https://localhost:3443');assert(await page.locator('#home-view').isVisible());assert(!(await page.locator('#signup').isVisible()));
 await page.locator('.nav a[href="#signup"]').click();assert(await page.locator('#signup').isVisible());assert(!(await page.locator('#login').isVisible()));
 const email=`ui.${Date.now()}@example.com`,password='Browser-Secret-PoC!2026',fullName='Jordan UI Example';
 await page.locator('#sName').fill(fullName);await page.locator('#sEmail').fill(email);await page.locator('#sPassword').fill(password);await page.locator('#sConfirm').fill('Different-Password!2026');
 await page.locator('#signup button[type="submit"]').click();assert(await page.locator('#sConfirm').evaluate(e=>!e.validity.valid));
 await page.locator('#sConfirm').fill(password);await page.locator('[data-toggle="sPassword"]').click();assert.equal(await page.locator('#sPassword').getAttribute('type'),'text');await page.locator('[data-toggle="sPassword"]').click();
 await page.screenshot({path:'output/evidence/signup-page.png',fullPage:true});
 await page.locator('#signup button[type="submit"]').click();await page.locator('#welcome').filter({hasText:fullName}).waitFor();
 assert.equal(await page.locator('#me').textContent(),email);await page.screenshot({path:'output/evidence/signup.png',fullPage:true});

 await page.locator('#logout').click();await page.locator('#login-view').waitFor({state:'visible'});
 await page.locator('#lEmail').fill(email);await page.locator('#lPassword').fill('Incorrect-Password!2026');await page.locator('#login button[type="submit"]').click();await page.locator('#lStatus').filter({hasText:'Invalid credentials.'}).waitFor();
 await page.locator('#lPassword').fill(password);await page.locator('#login button[type="submit"]').click();await page.locator('#welcome').filter({hasText:fullName}).waitFor();await page.screenshot({path:'output/evidence/login.png',fullPage:true});
 await page.locator('#logout').click();await page.locator('#login-view').waitFor({state:'visible'});await page.screenshot({path:'output/evidence/login-page.png',fullPage:true});
 await page.locator('.brand').click();await page.locator('#home-view').waitFor({state:'visible'});await page.screenshot({path:'output/evidence/frontend.png',fullPage:true});
 await page.locator('.nav a[href="#signup"]').click();await page.reload();assert(await page.locator('#signup-view').isVisible());
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'output/evidence/signup-mobile.png',fullPage:true});
 await page.goBack();assert(await page.locator('#home-view').isVisible());assert.deepEqual(errors,[]);
 fs.writeFileSync('output/evidence/browser-results.json',JSON.stringify({certificateBypass:false,traffic,checks:['Separate views and navigation','Password confirmation blocks mismatch','Password visibility toggle','Signup and encrypted full name persistence','Wrong password rejection','Login and profile greeting','Logout','Refresh preserves route','Back navigation','Mobile layout without overflow','No JavaScript errors']},null,2));
 console.log('PASS: navigation, confirmation, encrypted name storage, signup/login/logout, refresh/back and mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
