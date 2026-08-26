# Acceptance criteria for the buying journey.
# Executed by acceptance/shopping.test.js.
#
# The "Placing the order" scenarios write real rows and therefore run only when
# RUN_DESTRUCTIVE=1 is set.

Feature: Filling a cart and buying
  As a signed-in customer
  I want to collect laptops in a cart and check out
  So that I receive the laptops I chose at the price I was shown

  Background:
    Given the TechZone shop is online
    And the catalogue has laptops in stock
    And a customer has signed in
    And the customer's cart is empty

  Scenario: Adding a laptop to the cart
    When the customer adds a laptop to the cart
    Then the cart contains that laptop
    And the cart charges the price the shop advertised

  Scenario: The cart total is the sum of its lines
    Given the customer has laptops in the cart
    When the customer looks at the cart
    Then the total equals the sum of every line

  Scenario: Changing how many units to buy
    Given the customer has one unit of a laptop in the cart
    When the customer increases the quantity
    Then the cart shows two units
    When the customer decreases the quantity
    Then the cart shows one unit again

  Scenario: Removing a laptop from the cart
    Given the customer has a laptop in the cart
    When the customer removes it
    Then the cart no longer contains that laptop

  Scenario: The shop will not sell more units than it has
    When the customer tries to buy more units than the shop holds
    Then the shop refuses and says how many are available
    And nothing is added to the cart

  Scenario: One customer never sees another customer's cart
    Given two customers are signed in
    Then each customer sees only their own cart

  Scenario: Placing the order
    Given the customer has a laptop in the cart
    When the customer places the order
    Then the order is accepted
    And the order lists the laptop that was bought
    And the cart is emptied
    And the stock in the shop goes down by what was bought
    And the order appears in the customer's order history

  Scenario: Checking out with an empty cart
    Given the customer's cart is empty
    When the customer tries to place an order
    Then the shop refuses and says the cart is empty
