# Acceptance criteria for who is allowed to do what.
# Executed by acceptance/staff.test.js.
#
# One scenario is marked KNOWN GAP: it describes behaviour the platform does not yet
# have. (A second, SEC-01, was inverted on 2026-09-12 when ADR-0012 fixed it.) It is
# written here because it is a genuine acceptance criterion, and the
# executable test records the current answer while naming the defect, so the gap is
# visible rather than forgotten.

Feature: Staff and customer boundaries
  As the shop owner
  I want administrative work restricted to staff
  So that customers cannot change the catalogue or other people's orders

  Background:
    Given the TechZone shop is online

  Scenario: A customer cannot open the administration screens
    Given a customer has signed in
    When the customer asks for the administrator's product list
    Then the request is refused

  Scenario: A customer cannot open the seller screens
    Given a customer has signed in
    When the customer asks for the seller's product list
    Then the request is refused

  Scenario: A seller manages their own catalogue
    Given a seller has signed in
    When the seller asks for their product list
    Then the list is shown

  Scenario: A seller cannot open the administration screens
    Given a seller has signed in
    When the seller asks for the administrator's product list
    Then the request is refused

  Scenario: An administrator sees every order
    Given an administrator has signed in
    When the administrator asks for the order list
    Then the list is shown

  Scenario: An administrator sees the shop's figures
    Given an administrator has signed in
    When the administrator asks for the analytics
    Then the figures are shown

  Scenario: A visitor who has not signed in reaches nothing private
    When an anonymous visitor asks for a cart, an order list or the administration screens
    Then every one of those requests is refused

  Scenario: A shopper cannot grant themselves administrator rights (SEC-01, fixed)
    When a shopper registers
    Then they are a plain customer
    And they cannot reach the administration screens

  Scenario: Not even an administrator can create another administrator
    Given an administrator has signed in
    When they try to create an account with the administrator role
    Then the shop refuses
    # Promoting an administrator is done in the identity provider's console, not the shop.

  Scenario: An administrator creates a seller
    Given an administrator has signed in
    When they create a seller account
    Then the account is created with a temporary password the seller must change

  Scenario: A seller cannot create accounts
    Given a seller has signed in
    When they try to create an account
    Then the shop refuses

  Scenario: An administrator can still reach the seller screens
    Given an administrator has signed in
    When they open the seller product list
    Then the list is shown

  Scenario: KNOWN GAP - any signed-in shopper can list every cart
    Given a customer has signed in
    When the customer asks for every cart in the shop
    Then the shop should refuse
    But today the shop answers (SEC-07)
