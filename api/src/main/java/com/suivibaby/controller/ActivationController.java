package com.suivibaby.controller;

import com.suivibaby.model.ActivationRequest;
import com.suivibaby.service.ActivationService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/activation")
@PermitAll
public class ActivationController {

    @Inject
    ActivationService activationService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response activate(@Valid ActivationRequest request) {
        activationService.activate(request.token(), request.password());
        return Response.noContent().build(); // 204
    }

    @GET
    @Path("/{token}")
    public Response check(@PathParam("token") String token) {
        activationService.checkUsable(token);
        return Response.noContent().build();
    }
}
