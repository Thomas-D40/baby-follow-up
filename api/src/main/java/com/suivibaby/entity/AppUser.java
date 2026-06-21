package com.suivibaby.entity;

import io.quarkus.security.jpa.Password;
import io.quarkus.security.jpa.Roles;
import io.quarkus.security.jpa.UserDefinition;
import io.quarkus.security.jpa.Username;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Application account (admin or parent). Plain JPA entity: data access goes through
 * {@code AppUserRepository} (repository layer).
 *
 * <p>Annotated {@link UserDefinition}: security-jpa derives from it the IdentityProvider that
 * validates the email / password pair (BCrypt, MCF format) on form-auth login — the paved road,
 * no homemade auth mechanism (see plan D-A). {@code passwordHash} is never null: a "pending
 * activation" account carries an unusable placeholder hash (see {@code PasswordUtil}).
 */
@Entity
@Table(name = "app_user")
@UserDefinition
public class AppUser {

    @Id
    public UUID id;

    @Column(nullable = false, unique = true)
    @Username
    public String email;

    @Column(name = "password_hash")
    @Password
    public String passwordHash;

    @Column(name = "first_name")
    public String firstName;

    /** {@code admin} | {@code parent}. */
    @Column(nullable = false)
    @Roles
    public String role;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
