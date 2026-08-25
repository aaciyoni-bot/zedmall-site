/* אזור אישי — שער כניסה (צד לקוח בלבד) */
var KehatiAuth = (function () {
  "use strict";
  var KEY = "kehati-area-auth";
  var USER = "YONI";
  var PASS = "1234";

  /* ההתחברות נשמרת במכשיר (localStorage) כדי שלא תידרש כניסה מחדש בכל טאב */
  function isAuthed() {
    try { return localStorage.getItem(KEY) === "1" || sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function login(user, pass) {
    if (String(user).trim().toUpperCase() === USER && String(pass) === PASS) {
      try { localStorage.setItem(KEY, "1"); } catch (e) {}
      return true;
    }
    return false;
  }
  function logout() {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
  }
  /* הפניה לעמוד הכניסה אם אין הרשאה. loginPath יחסי לעמוד הנוכחי */
  function guard(loginPath) {
    if (!isAuthed()) window.location.replace(loginPath || "./");
  }
  return { isAuthed: isAuthed, login: login, logout: logout, guard: guard };
})();
