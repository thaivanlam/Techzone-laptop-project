# Acceptance criteria for creating an account and signing in.
# Executed by acceptance/account.test.js.

Feature: Creating an account and signing in
  As a shopper
  I want to register and sign in
  So that I can keep a cart and place orders

  Background:
    Given the TechZone shop is online

  Scenario: A new shopper registers
    When the shopper registers with a username, an email address and a password
    Then the shop confirms the account was created
    And the shopper can sign in with those credentials

  Scenario: A username can only be used once
    Given a shopper has already registered
    When another shopper tries to register with the same username
    Then the shop refuses and explains that the username is taken

  Scenario: An email address can only be used once
    Given a shopper has already registered
    When another shopper tries to register with the same email address
    Then the shop refuses and explains that the email address is taken

  Scenario: A password that is too short is refused
    When the shopper tries to register with a five-character password
    Then the shop refuses before creating anything

  Scenario: An address that is not an email address is refused
    When the shopper tries to register with "not-an-email" as their email address
    Then the shop refuses before creating anything

  Scenario: Signing in with the wrong password fails
    Given a registered shopper
    When they sign in with the wrong password
    Then they are not signed in
    And they receive no session

  Scenario: A signed-in shopper is recognised on the next request
    Given a registered shopper who has signed in
    When they ask who they are
    Then the shop returns their username and their role

  Scenario: Signing out ends the session
    Given a registered shopper who has signed in
    When they sign out
    Then their following requests are treated as anonymous
