# UML — Structure Diagrams

What the platform is made of: components and their connections, how they are
deployed, and the classes behind both.

Part of the diagram set indexed by [uml-diagrams.md](uml-diagrams.md) ·
Siblings: [uml-use-cases.md](uml-use-cases.md) ·
[uml-behaviour.md](uml-behaviour.md)

---

## Table of Contents

1. [Component Diagram](#1-component-diagram)
2. [Deployment Diagram](#2-deployment-diagram)
3. [Domain Class Diagram](#3-domain-class-diagram)
4. [Backend Layering Class Diagram](#4-backend-layering-class-diagram)

---

## 1. Component Diagram

What talks to what, and over which protocol.

```mermaid
flowchart TB
    subgraph client["Client tier"]
        SPA["React SPA<br/>Redux Toolkit · React Router"]
    end

    subgraph edge["Edge"]
        NGINX["nginx<br/>static files + /​*-manager proxy"]
        GW["API Gateway<br/>Spring Cloud Gateway (WebFlux)<br/>AuthenticationFilter · CORS · role rules"]
    end

    subgraph platform["Platform services"]
        CFG["Config Server<br/>native profile"]
        EUR["Discovery Service<br/>Eureka"]
    end

    subgraph business["Business services"]
        USR["User Service<br/>identity · JWT issuer · addresses"]
        PRD["Product Service<br/>catalogue · specs · images · stock"]
        ORD["Order Service<br/>cart · orders · Stripe"]
        NOT["Notification Service<br/>RabbitMQ consumer · SMTP"]
    end

    subgraph data["State"]
        MYSQL[("MySQL 8<br/>3 logical databases")]
        MQ[["RabbitMQ<br/>notification-exchange"]]
        FS[/"Image directory"/]
    end

    STRIPE(["Stripe API"])
    MAIL(["Gmail SMTP"])

    SPA -->|HTTPS/JSON| NGINX
    NGINX -->|HTTP| GW
    GW -->|lb:// via Eureka| USR & PRD & ORD
    USR & PRD & ORD & NOT -->|bootstrap config| CFG
    USR & PRD & ORD & NOT & GW -->|register / resolve| EUR
    USR & PRD & ORD -->|JDBC| MYSQL
    ORD -->|REST /api/internal| PRD
    ORD -->|PaymentIntent| STRIPE
    USR -->|publish| MQ
    ORD -->|publish| MQ
    MQ -->|consume| NOT
    NOT -->|SMTP| MAIL
    PRD --> FS
```

Two things the diagram makes visible that prose hides: **Notification Service is
not behind the gateway** — it is reached only through the broker, or directly on
its port — and **Order Service is the only service that calls another
synchronously**, which is why it is the only one whose availability depends on
another's.

### Connector inventory

| From | To | Protocol | Synchronous | Failure behaviour |
|---|---|---|---|---|
| SPA | nginx / gateway | HTTP + cookie | yes | Surfaced to the user |
| Gateway | business services | HTTP via `lb://` | yes | `503` if unregistered |
| Order Service | Product Service | HTTP `RestTemplate` | yes | **Propagates — no circuit breaker** |
| Order Service | Stripe | HTTPS | yes | Checkout fails |
| User / Order Service | RabbitMQ | AMQP publish | no | Publish sits inside the order transaction (`BUG-11`) |
| RabbitMQ | Notification Service | AMQP consume | no | A failed send is swallowed (`BUG-06`) |
| Services | Config Server | HTTP, at boot | yes | Service exits at startup |
| Services | Eureka | HTTP, periodic | no | Stale registry until the lease expires |

---

## 2. Deployment Diagram

The full-Docker topology from [`docker-compose.yml`](../../docker-compose.yml).
Ports shown are host ports; inside `ecommerce-network` every container is
addressed by service name.

```mermaid
flowchart TB
    subgraph host["Docker host"]
        subgraph net["ecommerce-network (bridge)"]
            FE["frontend<br/>nginx:1.27-alpine<br/>:80 → host 5173"]
            AGW["api-gateway<br/>JRE 21 · :8080"]
            CS["config-server<br/>:8888"]
            DS["discovery-service<br/>:8761"]
            US["user-service · :8082"]
            PS["product-service · :8081"]
            OS["order-service · :8083"]
            NS["notification-service · :8084"]
            DB[("mysql:8.0<br/>:3306 → host MYSQL_PORT")]
            RMQ[["rabbitmq:3-management<br/>:5672 · :15672"]]
            SEED["db-seed<br/>one-shot, profile: seed"]
        end
        VOL[("mysql_data volume")]
        IMG[("product image volume")]
    end
    BROWSER(["Browser"]) -->|:5173| FE
    FE --> AGW
    AGW --> US & PS & OS
    US & PS & OS --> DB
    US & OS --> RMQ --> NS
    DB --- VOL
    PS --- IMG
    SEED --> DB
```

Start-up ordering is enforced by Compose health checks, not by retry loops:
config-server and discovery-service must report healthy before a business
service starts, and the gateway waits for the services it routes to. See
[../operations/docker-setup.md](../operations/docker-setup.md).

Every service is drawn as one instance because one is what runs. Nothing in the
design prevents more — identity travels in the token, so there is no session
affinity — except the stock race described in
[uml-behaviour.md](uml-behaviour.md#4-sequence--checkout-and-payment).

---

## 3. Domain Class Diagram

The persistent domain, across all three services. Dashed links cross a database
boundary and are therefore **not** foreign keys.

```mermaid
classDiagram
    class User {
        +Long userId
        +String userName
        +String email
        +String password
        +Set~Role~ roles
        +List~Address~ addresses
    }
    class Role {
        +Integer roleId
        +AppRole roleName
    }
    class Address {
        +Long addressId
        +String street
        +String buildingName
        +String city
        +String state
        +String country
        +String pincode
    }
    class Category {
        +Long categoryId
        +String categoryName
    }
    class Product {
        +Long productId
        +String productName
        +String brand
        +String sku
        +String image
        +Integer quantity
        +double price
        +double discount
        +double specialPrice
        +Long sellerId
        +String sellerEmail
    }
    class ProductSpecification {
        +Long id
        +String processor
        +String ram
        +String storage
        +String display
        +String graphics
    }
    class Cart {
        +Long cartId
        +String userEmail
        +Double totalPrice
    }
    class CartItem {
        +Long cartItemId
        +Integer quantity
        +Double discount
        +Double productPrice
    }
    class Order {
        +Long orderId
        +String email
        +LocalDate orderDate
        +Double totalAmount
        +String orderStatus
        +Long addressId
    }
    class OrderItem {
        +Long orderItemId
        +Integer quantity
        +Double discount
        +Double orderedProductPrice
    }
    class Payment {
        +Long paymentId
        +String paymentMethod
        +String pgPaymentId
        +String pgStatus
        +String pgResponseMessage
        +String pgName
    }
    class ProductSnapshot {
        <<Embeddable>>
        +Long productId
        +String productName
        +String image
        +String description
        +Double price
        +Double discount
        +Double specialPrice
        +Long sellerId
        +String sellerEmail
    }

    User "1" --> "*" Address : owns
    User "*" --> "*" Role : holds
    Category "1" --> "*" Product : contains
    Product "1" --> "0..1" ProductSpecification : described by
    Cart "1" --> "*" CartItem : holds
    Order "1" --> "*" OrderItem : consists of
    Order "1" --> "1" Payment : settled by
    CartItem "1" *-- "1" ProductSnapshot : embeds
    OrderItem "1" *-- "1" ProductSnapshot : embeds
    ProductSnapshot ..> Product : copied from, not linked
    Order ..> Address : addressId only
    Product ..> User : sellerEmail only
```

The three dashed relations are the whole cross-service story of the model. Two
of them are plain ids that can dangle; the third — `ProductSnapshot` — is a
deliberate copy, and is the reason an order's line items keep their prices when
a seller re-prices the product. See
[decisions/0007-embedded-product-snapshot.md](decisions/0007-embedded-product-snapshot.md).

The physical schema these classes generate — columns, types, constraints and the
gaps in them — is in [data-model.md](data-model.md).

---

## 4. Backend Layering Class Diagram

Every business service is built the same way. Product Service is drawn; User and
Order Service differ only in the names.

```mermaid
classDiagram
    direction LR
    class ProductController {
        <<@RestController>>
        +getAllProducts(filters, paging) ResponseEntity
        +addProduct(categoryId, dto) ResponseEntity
        +updateProduct(productId, dto) ResponseEntity
        +deleteProduct(productId) ResponseEntity
        +updateProductImage(productId, file) ResponseEntity
    }
    class ProductService {
        <<interface>>
    }
    class ProductServiceImpl {
        -ProductRepository repo
        -CategoryRepository categories
        -ModelMapper mapper
        -FileService files
        +searchProducts(...) ProductResponse
        +addProduct(...) ProductDTO
    }
    class ProductRepository {
        <<interface>>
        JpaRepository~Product,Long~
        JpaSpecificationExecutor~Product~
    }
    class SKUGenerator {
        <<utility>>
        +generateSKU(category, brand, name) String
    }
    class JwtService {
        +resolveToken(request) String
        +isTokenValid(token) boolean
        +extractEmail(token) String
    }
    class AuthUtil {
        +loggedInEmail() String
    }
    class GlobalExceptionHandler {
        <<@RestControllerAdvice>>
        +handleApiException(...) APIResponse
        +handleResourceNotFound(...) APIResponse
    }
    class ProductDTO {
        <<payload>>
    }
    class Product {
        <<@Entity>>
    }

    ProductController --> ProductService
    ProductService <|.. ProductServiceImpl
    ProductServiceImpl --> ProductRepository
    ProductServiceImpl --> SKUGenerator
    ProductServiceImpl --> AuthUtil
    AuthUtil --> JwtService
    ProductRepository --> Product
    ProductServiceImpl --> ProductDTO
    GlobalExceptionHandler ..> ProductController : advises
```

The convention is stated once in
[../backend/overview.md](../backend/overview.md#shared-conventions):
`controller → service → repository → model`, DTOs in `payload`, errors funnelled
through a `@RestControllerAdvice`.

Identity is **not** a Spring Security concern downstream — each service parses
the cookie itself through its own `AuthUtil`, and no `SecurityContext` is built.
That is what makes the services stateless, and also why a missing gateway rule
produces an *unauthenticated* endpoint rather than merely an unauthorised one.
The working rules for staying inside this structure are in
[../development/developer-guide.md](../development/developer-guide.md#4-backend-conventions).
