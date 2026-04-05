from django.contrib.auth.models import User
from django.test import TestCase, Client


class RegisterTest(TestCase):
    def test_register_page_loads(self):
        resp = self.client.get("/accounts/register/")
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Register")

    def test_register_creates_user(self):
        resp = self.client.post("/accounts/register/", {
            "username": "newuser",
            "password1": "Str0ng!Pass",
            "password2": "Str0ng!Pass",
        })
        self.assertEqual(resp.status_code, 302)
        self.assertTrue(User.objects.filter(username="newuser").exists())


class LoginTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")

    def test_login_page_loads(self):
        resp = self.client.get("/accounts/login/")
        self.assertEqual(resp.status_code, 200)

    def test_login_success(self):
        resp = self.client.post("/accounts/login/", {
            "username": "tester",
            "password": "pass1234",
        })
        self.assertEqual(resp.status_code, 302)

    def test_login_failure(self):
        resp = self.client.post("/accounts/login/", {
            "username": "tester",
            "password": "wrong",
        })
        self.assertEqual(resp.status_code, 200)


class ProtectedViewsTest(TestCase):
    def test_home_requires_login(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 302)
        self.assertIn("/accounts/login/", resp.url)

    def test_home_accessible_when_logged_in(self):
        User.objects.create_user("tester", password="pass1234")
        self.client.login(username="tester", password="pass1234")
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
