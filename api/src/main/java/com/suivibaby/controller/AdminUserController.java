package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.AccountDeletionImpactResponse;
import com.suivibaby.model.AccountResponse;
import com.suivibaby.model.CreateUserRequest;
import com.suivibaby.model.CreateUserResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.AccountDeletionService;
import com.suivibaby.service.AccountService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@Path("/api/admin/users")
@RolesAllowed("admin")
public class AdminUserController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    AccountService accountService;

    @Inject
    AccountDeletionService accountDeletionService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<AccountResponse> list() {
        return accountService.getAllAccounts();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@Valid CreateUserRequest request) {
        AppUser currentUser = currentUserResolver.require();
        CreateUserResponse created = accountService.createParent(request.email(), request.firstName());
        // Sent here, after createParent() has returned: the transaction is committed, so a refused request
        // never mails and a mail failure cannot undo the account (D20-C, D17-Y).
        boolean mailSent = accountService.sendActivationMail(
                created.userId(), created.activationLink(), currentUser.firstName);
        return Response.status(Response.Status.CREATED).entity(created.withMailSent(mailSent)).build();
    }

    @POST
    @Path("/{id}/activation-link")
    @Produces(MediaType.APPLICATION_JSON)
    public CreateUserResponse regenerateLink(@PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        CreateUserResponse regenerated = accountService.regenerateActivationLink(id);
        boolean mailSent = accountService.sendActivationMail(
                regenerated.userId(), regenerated.activationLink(), currentUser.firstName);
        return regenerated.withMailSent(mailSent);
    }

    @GET
    @Path("/{id}/deletion-impact")
    @Produces(MediaType.APPLICATION_JSON)
    public AccountDeletionImpactResponse deletionImpact(@PathParam("id") UUID id) {
        return accountDeletionService.getDeletionImpact(id);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") UUID id, @QueryParam("impactToken") String impactToken,
                           @QueryParam("pendingOnly") boolean isPendingOnly) {
        accountDeletionService.deleteAccount(id, impactToken, isPendingOnly);
        return Response.noContent().build();
    }
}
