# Acceptance criteria written from the customer's point of view.
# Each scenario below is executed by acceptance/shopping.test.js.

Feature: Browsing the shop
  As a visitor who has not signed in
  I want to browse and narrow down the laptop catalogue
  So that I can decide what to buy before creating an account

  Background:
    Given the TechZone shop is online
    And the catalogue has laptops in it

  Scenario: A visitor sees the shop without signing in
    When the visitor opens the shop
    Then a list of laptops is shown
    And each laptop shows a name, a price and a picture

  Scenario: A visitor sees the price they will actually pay
    When the visitor opens the shop
    Then every laptop shows a selling price no higher than its list price

  Scenario: A visitor narrows the list by brand
    Given the visitor can see the brands the shop carries
    When the visitor picks one brand
    Then only laptops of that brand are shown

  Scenario: A visitor narrows the list by budget
    When the visitor sets a maximum price
    Then no laptop above that price is shown

  Scenario: A visitor searches for a laptop by name
    When the visitor types part of a laptop name into the search box
    Then that laptop is among the results

  Scenario: A search that matches nothing tells the visitor so
    When the visitor searches for something the shop does not sell
    Then the shop reports that nothing matched
    And the shop does not fail with a server error

  Scenario: A visitor moves through the catalogue a page at a time
    When the visitor asks for a page of two laptops
    Then at most two laptops are shown
    And the shop says whether more pages follow
