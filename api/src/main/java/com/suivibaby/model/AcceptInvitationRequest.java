package com.suivibaby.model;

// Nullable password: only a recipient whose account is still pending defines one (D17-AB).
public record AcceptInvitationRequest(String password) {
}
