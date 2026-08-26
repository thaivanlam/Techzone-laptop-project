# Acceptance criteria for who is allowed to do what.
# Executed by acceptance/staff.test.js.
#
# Two scenarios are marked KNOWN GAP: they describe behaviour that the platform does not
# yet have. They are written here because they are genuine acceptance criteria, and the
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

  Scenario: KNOWN GAP - a shopper can grant themselves administrator rights at sign-up
    When a shopper registers and asks for the administrator role
    Then the shop should refuse
    But today the shop grants it (SEC-01)

  Scenario: KNOWN GAP - any signed-in shopper can list every cart
    Given a customer has signed in
    When the customer asks for every cart in the shop
    Then the shop should refuse
    But today the shop answers (SEC-07)
